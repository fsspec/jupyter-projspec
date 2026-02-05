import json
import logging
import os
import shlex
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor

from jupyter_server.base.handlers import APIHandler
from jupyter_server.services.contents.manager import ContentsManager
from jupyter_server.utils import url_path_join
import projspec
import tornado

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=10)

# Maximum concurrent make commands allowed (prevents thread pool exhaustion
# from long-running commands that each block for up to COMMAND_TIMEOUT_SECONDS)
MAX_CONCURRENT_COMMANDS = 5
_active_commands = 0
_active_commands_lock = threading.Lock()


class ConcurrencyLimitError(RuntimeError):
    """Raised when the maximum number of concurrent commands is reached."""


# Maximum bytes of stdout/stderr to capture from a subprocess
MAX_OUTPUT_BYTES = 1024 * 1024  # 1 MB per stream

# Timeout for command execution in seconds
COMMAND_TIMEOUT_SECONDS = 120

class PathSecurityError(ValueError):
    """Raised when a path violates security constraints (traversal, symlink escape)."""


class PathNotFoundError(ValueError):
    """Raised when a resolved path does not exist on disk."""


class PathNotDirectoryError(ValueError):
    """Raised when a resolved path is not a directory."""


class ArtifactLookupError(ValueError):
    """Raised when a spec type or artifact name cannot be found in projspec."""


def resolve_path(contents_manager: ContentsManager, relative_path: str) -> str:
    """Validate and resolve a relative path to an absolute path within the server root.

    Uses realpath to resolve symlinks and os.path.commonpath for containment
    checking, which correctly handles edge cases like server_root=/ and
    prefix-sharing siblings.

    Args:
        contents_manager: The Jupyter contents manager (provides root_dir).
        relative_path: Path relative to the server root. Must not be absolute.

    Returns:
        The resolved absolute path.

    Raises:
        PathSecurityError: If the path is absolute or resolves outside the
            server root (including via symlinks).
        PathNotFoundError: If the resolved path does not exist.
        PathNotDirectoryError: If the resolved path is not a directory.
    """
    if os.path.isabs(relative_path):
        raise PathSecurityError("Path must be relative, not absolute")

    server_root = os.path.realpath(contents_manager.root_dir)

    if relative_path:
        absolute_path = os.path.realpath(
            os.path.join(server_root, relative_path)
        )
    else:
        absolute_path = server_root

    # Containment check using commonpath, which correctly handles:
    # - server_root = "/" (trailing-separator approach would produce "//")
    # - prefix-sharing siblings like /project vs /project_evil
    try:
        common = os.path.commonpath([server_root, absolute_path])
    except ValueError:
        # On Windows, commonpath raises ValueError for paths on different drives
        raise PathSecurityError("Access denied: path outside server root")

    if common != server_root:
        raise PathSecurityError("Access denied: path outside server root")

    if not os.path.exists(absolute_path):
        raise PathNotFoundError(f"Path does not exist: {relative_path}")

    if not os.path.isdir(absolute_path):
        raise PathNotDirectoryError(
            f"Path is not a directory: {relative_path}"
        )

    return absolute_path


def _read_stream(stream, max_bytes: int, result: list[bytes]) -> None:
    """Read from a stream up to max_bytes, discarding the rest.

    Reads in chunks to avoid loading unbounded output into memory.
    Once max_bytes is reached, continues draining the stream (to avoid
    blocking the subprocess) but discards the excess data.
    """
    data = b""
    while len(data) < max_bytes:
        chunk = stream.read(min(4096, max_bytes - len(data)))
        if not chunk:
            break
        data += chunk
    # Drain remaining output so the subprocess doesn't block on a full pipe
    while stream.read(65536):
        pass
    result.append(data)


class OutputCaptureError(RuntimeError):
    """Raised when reader threads fail to complete and output may be incomplete."""


def _run_with_output_limit(
    command: list[str],
    cwd: str,
    timeout: int,
) -> dict:
    """Run a command with server-side output size limits.

    Reads stdout/stderr in parallel threads, each capped at MAX_OUTPUT_BYTES.
    Excess output is drained but discarded, preventing memory exhaustion from
    commands that produce unbounded output.

    Raises:
        OutputCaptureError: If reader threads do not complete within 5 seconds
            after the process exits, indicating output may be incomplete.
        subprocess.TimeoutExpired: If the command exceeds the given timeout.
    """
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=cwd,
        shell=False,
    )

    stdout_data: list[bytes] = []
    stderr_data: list[bytes] = []

    stdout_thread = threading.Thread(
        target=_read_stream,
        args=(process.stdout, MAX_OUTPUT_BYTES, stdout_data),
        daemon=True,
    )
    stderr_thread = threading.Thread(
        target=_read_stream,
        args=(process.stderr, MAX_OUTPUT_BYTES, stderr_data),
        daemon=True,
    )

    try:
        stdout_thread.start()
        stderr_thread.start()

        try:
            process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            process.kill()
            stdout_thread.join(timeout=5)
            stderr_thread.join(timeout=5)
            raise
    finally:
        # Ensure the process is terminated if still running (e.g., exception
        # between Popen and wait, or unexpected error in thread setup)
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        # Close streams to release file descriptors promptly
        if process.stdout:
            process.stdout.close()
        if process.stderr:
            process.stderr.close()

    stdout_thread.join(timeout=5)
    stderr_thread.join(timeout=5)

    # Raise if reader threads are still alive — output is incomplete
    if stdout_thread.is_alive() or stderr_thread.is_alive():
        logger.error("Reader threads did not complete within timeout")
        raise OutputCaptureError("Failed to capture complete command output")

    stdout_bytes = stdout_data[0] if stdout_data else b""
    stderr_bytes = stderr_data[0] if stderr_data else b""

    stdout_truncated = len(stdout_bytes) >= MAX_OUTPUT_BYTES
    stderr_truncated = len(stderr_bytes) >= MAX_OUTPUT_BYTES

    stdout = stdout_bytes.decode("utf-8", errors="replace")
    stderr = stderr_bytes.decode("utf-8", errors="replace")

    if stdout_truncated:
        stdout += "\n... (output truncated by server)"
    if stderr_truncated:
        stderr += "\n... (output truncated by server)"

    return {
        "stdout": stdout,
        "stderr": stderr,
        "returncode": process.returncode,
        "truncated": stdout_truncated or stderr_truncated,
    }


class MakeRouteHandler(APIHandler):
    """Handler for executing artifact build commands via projspec.

    Accepts artifact identifiers (path, spec_type, artifact_name) and resolves
    the actual command from projspec's artifact registry. This ensures only
    valid, known commands from the project definition can be executed.
    """

    @tornado.web.authenticated
    async def post(self):
        """Execute an artifact's build command.

        Request Body:
            path: Relative path from server root (empty string for root)
            spec_type: The projspec spec type (e.g., "python_library")
            artifact_name: The artifact name (e.g., "wheel", "build")

        Returns:
            JSON with stdout, stderr, and returncode from the command execution.
        """
        try:
            data = self.get_json_body()
        except (json.JSONDecodeError, ValueError):
            self.set_status(400)
            self.finish(json.dumps({"error": "Invalid or missing JSON body"}))
            return

        # Validate request body is a dict
        if not isinstance(data, dict):
            self.set_status(400)
            self.finish(json.dumps({"error": "Request body must be a JSON object"}))
            return

        # Validate required fields are present, non-empty strings
        missing_fields = []
        for field in ("spec_type", "artifact_name"):
            value = data.get(field)
            if not isinstance(value, str) or not value.strip():
                missing_fields.append(field)

        if missing_fields:
            self.set_status(400)
            self.finish(json.dumps({
                "error": f"Missing or invalid required fields: {', '.join(missing_fields)}"
            }))
            return

        # Validate path field type (defaults to empty string)
        path = data.get("path", "")
        if not isinstance(path, str):
            self.set_status(400)
            self.finish(json.dumps({"error": "Field 'path' must be a string"}))
            return

        try:
            result = await tornado.ioloop.IOLoop.current().run_in_executor(
                _executor, self._run_make_command, data
            )
            self.finish(json.dumps(result))
        except subprocess.TimeoutExpired:
            self.set_status(504)
            self.finish(json.dumps({"error": "Command execution timed out"}))
        except OutputCaptureError as e:
            logger.error("Output capture failed: %s", e)
            self.set_status(500)
            self.finish(json.dumps({"error": "Failed to capture command output"}))
        except ConcurrencyLimitError:
            self.set_status(429)
            self.finish(json.dumps({
                "error": "Too many concurrent commands. Please wait and try again."
            }))
        except PathSecurityError as e:
            self.set_status(403)
            self.finish(json.dumps({"error": str(e)}))
        except PathNotFoundError as e:
            self.set_status(404)
            self.finish(json.dumps({"error": str(e)}))
        except (PathNotDirectoryError, ArtifactLookupError) as e:
            self.set_status(400)
            self.finish(json.dumps({"error": str(e)}))
        except Exception as e:
            logger.error("Make command error: %s", e, exc_info=True)
            self.set_status(500)
            self.finish(json.dumps({"error": "Internal server error"}))

    def _run_make_command(self, data: dict) -> dict:
        """Resolve and run an artifact command via projspec (called in thread pool).

        Looks up the artifact in projspec's registry and executes its command,
        rather than accepting arbitrary shell commands from the client.

        Raises:
            ConcurrencyLimitError: If the maximum number of concurrent commands
                is already running.
        """
        global _active_commands

        path = data.get("path", "")
        spec_type = data["spec_type"]
        artifact_name = data["artifact_name"]

        # Resolve and validate the path
        absolute_path = resolve_path(self.contents_manager, path)

        # Load the project via projspec
        project = projspec.Project(absolute_path)

        # Validate spec_type exists
        if spec_type not in project.specs:
            raise ArtifactLookupError(f"Unknown spec type: {spec_type}")

        spec = project.specs[spec_type]

        # Validate artifact_name exists
        if artifact_name not in spec.artifacts:
            raise ArtifactLookupError(f"Artifact not found: {artifact_name}")

        artifact = spec.artifacts[artifact_name]
        command = artifact.cmd

        # Reject artifacts with no command defined
        if command is None:
            raise ArtifactLookupError(
                f"Artifact '{artifact_name}' has no command defined"
            )

        # Handle both string and list command formats from projspec.
        # Note: shell=False means shell features (pipes, redirects) won't work;
        # commands are executed directly via execvp.
        if isinstance(command, str):
            try:
                command_list = shlex.split(command, posix=(os.name != "nt"))
            except ValueError as e:
                raise ArtifactLookupError(
                    f"Artifact '{artifact_name}' has invalid command syntax: {e}"
                )
        elif isinstance(command, list):
            command_list = command
        else:
            raise ArtifactLookupError(
                f"Artifact '{artifact_name}' does not have a valid command"
            )

        if not command_list:
            raise ArtifactLookupError(
                f"Artifact '{artifact_name}' has an empty command"
            )
        if not all(isinstance(c, str) for c in command_list):
            raise ArtifactLookupError(
                f"Artifact '{artifact_name}' has a malformed command"
            )

        # Enforce concurrency limit to prevent thread pool exhaustion from
        # long-running commands (each can block up to COMMAND_TIMEOUT_SECONDS)
        with _active_commands_lock:
            if _active_commands >= MAX_CONCURRENT_COMMANDS:
                raise ConcurrencyLimitError(
                    f"Maximum concurrent commands ({MAX_CONCURRENT_COMMANDS}) reached"
                )
            _active_commands += 1
        try:
            return _run_with_output_limit(
                command_list, cwd=absolute_path, timeout=COMMAND_TIMEOUT_SECONDS
            )
        finally:
            with _active_commands_lock:
                _active_commands -= 1


class ScanRouteHandler(APIHandler):
    """Handler for scanning a directory with projspec."""

    @tornado.web.authenticated
    def get(self):
        """Scan a directory and return projspec project data as JSON.

        Query Parameters:
            path: Relative path from Jupyter server root (default: "")

        Returns:
            JSON with "project" key containing the to_dict() output,
            or "error" key if something went wrong.
        """
        relative_path = self.get_query_argument("path", default="")

        try:
            absolute_path = resolve_path(self.contents_manager, relative_path)
        except PathSecurityError as e:
            self.set_status(403)
            self.finish(json.dumps({"error": str(e)}))
            return
        except PathNotFoundError as e:
            self.set_status(404)
            self.finish(json.dumps({"error": str(e)}))
            return
        except PathNotDirectoryError as e:
            self.set_status(400)
            self.finish(json.dumps({"error": str(e)}))
            return

        # Scan the directory with projspec
        try:
            project = projspec.Project(absolute_path)
            project_dict = project.to_dict()

            self.finish(json.dumps({"project": project_dict}))
        except Exception as e:
            logger.error(
                "projspec error scanning %s: %s", absolute_path, e, exc_info=True
            )
            self.set_status(500)
            self.finish(json.dumps({"error": "Error scanning directory"}))


def setup_route_handlers(web_app):
    host_pattern = ".*$"
    base_url = web_app.settings["base_url"]

    scan_route_pattern = url_path_join(base_url, "jupyter-projspec", "scan")
    make_route_pattern = url_path_join(base_url, "jupyter-projspec", "make")

    handlers = [
        (scan_route_pattern, ScanRouteHandler),
        (make_route_pattern, MakeRouteHandler),
    ]

    web_app.add_handlers(host_pattern, handlers)
