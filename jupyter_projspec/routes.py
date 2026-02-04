import json
import os

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
import projspec
import tornado

from concurrent.futures import ThreadPoolExecutor
import subprocess

_executor = ThreadPoolExecutor(max_workers=10)

class MakeRouteHandler(APIHandler):
    async def post(self):
        data = self.get_json_body()

        try:
            result = await tornado.ioloop.IOLoop.current().run_in_executor(_executor, self._run_make_command, data)
            self.finish(json.dumps(result))
        except subprocess.TimeoutExpired as e:
            self.set_status(500)
            self.finish(json.dumps({"error": "Command timed out"}))
        except Exception as e:
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))

    def _run_make_command(self, data):
        """Run a make command (called in thread pool) and return the result."""

        command_string = data["command"]

        import shlex
        command_list = shlex.split(command_string)

        result = subprocess.run(command_list, capture_output=True, text=True, timeout=120)

        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode
        }

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
        # Get the relative path from query parameter
        relative_path = self.get_query_argument("path", default="")

        # Get the Jupyter server root directory
        server_root = self.contents_manager.root_dir

        # Resolve to absolute path
        if relative_path:
            absolute_path = os.path.join(server_root, relative_path)
        else:
            absolute_path = server_root

        # Normalize the path to handle any .. or . components
        absolute_path = os.path.normpath(absolute_path)

        # Security check: ensure the resolved path is within server root
        if not absolute_path.startswith(os.path.normpath(server_root)):
            self.set_status(403)
            self.finish(json.dumps({"error": "Access denied: path outside server root"}))
            return

        # Check if the path exists
        if not os.path.exists(absolute_path):
            self.set_status(404)
            self.finish(json.dumps({"error": f"Path does not exist: {relative_path}"}))
            return

        # Check if the path is a directory
        if not os.path.isdir(absolute_path):
            self.set_status(400)
            self.finish(json.dumps({"error": f"Path is not a directory: {relative_path}"}))
            return

        # Scan the directory with projspec
        try:
            project = projspec.Project(absolute_path)
            project_dict = project.to_dict()

            self.finish(json.dumps({"project": project_dict}))
        except Exception as e:
            console_error = f"projspec error scanning {absolute_path}: {e}"
            import sys

            print(console_error, file=sys.stderr)

            self.set_status(500)
            self.finish(json.dumps({"error": f"Error scanning directory: {str(e)}"}))


def setup_route_handlers(web_app):
    host_pattern = ".*$"
    base_url = web_app.settings["base_url"]

    # Scan endpoint for projspec
    scan_route_pattern = url_path_join(base_url, "jupyter-projspec", "scan")
    make_route_pattern = url_path_join(base_url, "jupyter-projspec", "make")

    handlers = [
        (scan_route_pattern, ScanRouteHandler),
        (make_route_pattern, MakeRouteHandler),
    ]

    web_app.add_handlers(host_pattern, handlers)
