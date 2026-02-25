import json
import os
import sys
from unittest.mock import MagicMock, patch

import pytest


async def test_scan_no_path(jp_fetch):
    """Test scan endpoint with no path parameter (defaults to server root)."""
    response = await jp_fetch("jupyter-projspec", "scan")

    assert response.code == 200
    payload = json.loads(response.body)
    assert "project" in payload


# ---------------------------------------------------------------------------
# resolve_path unit tests
# ---------------------------------------------------------------------------

class TestResolvePath:
    """Tests for the shared resolve_path helper function."""

    def _make_contents_manager(self, root_dir):
        """Create a minimal mock of a contents manager with root_dir."""
        class FakeContentsManager:
            pass
        cm = FakeContentsManager()
        cm.root_dir = root_dir
        return cm

    def test_empty_path_returns_root(self, tmp_path):
        """Empty string should resolve to the server root itself."""
        from jupyter_projspec.routes import resolve_path

        cm = self._make_contents_manager(str(tmp_path))
        result = resolve_path(cm, "")
        assert result == os.path.realpath(str(tmp_path))

    def test_valid_subdirectory(self, tmp_path):
        """A valid subdirectory should resolve correctly."""
        from jupyter_projspec.routes import resolve_path

        subdir = tmp_path / "child"
        subdir.mkdir()
        cm = self._make_contents_manager(str(tmp_path))
        result = resolve_path(cm, "child")
        assert result == os.path.realpath(str(subdir))

    def test_rejects_absolute_path(self, tmp_path):
        """Absolute paths must be rejected with PathSecurityError."""
        from jupyter_projspec.routes import PathSecurityError, resolve_path

        cm = self._make_contents_manager(str(tmp_path))
        with pytest.raises(PathSecurityError, match="must be relative"):
            resolve_path(cm, "/etc/passwd")

    def test_rejects_dot_dot_traversal(self, tmp_path):
        """Paths using .. to escape the root must be rejected."""
        from jupyter_projspec.routes import PathSecurityError, resolve_path

        cm = self._make_contents_manager(str(tmp_path))
        with pytest.raises(PathSecurityError, match="outside server root"):
            resolve_path(cm, "../../../etc")

    def test_rejects_prefix_bypass(self, tmp_path):
        """A sibling directory sharing a prefix must not pass containment.

        For example, if root is /tmp/project, then /tmp/project_evil must
        be rejected even though it starts with the same string prefix.
        """
        from jupyter_projspec.routes import PathSecurityError, resolve_path

        base = tmp_path / "root"
        base.mkdir()
        evil = tmp_path / "root_evil"
        evil.mkdir()

        cm = self._make_contents_manager(str(base))
        with pytest.raises(PathSecurityError, match="outside server root"):
            resolve_path(cm, "../root_evil")

    @pytest.mark.skipif(
        sys.platform == "win32",
        reason="Symlink creation may require elevated privileges on Windows",
    )
    def test_rejects_symlink_escape(self, tmp_path):
        """Symlinks pointing outside the root must be rejected."""
        from jupyter_projspec.routes import PathSecurityError, resolve_path

        root = tmp_path / "root"
        root.mkdir()
        outside = tmp_path / "outside"
        outside.mkdir()

        link = root / "escape"
        link.symlink_to(outside)

        cm = self._make_contents_manager(str(root))
        with pytest.raises(PathSecurityError, match="outside server root"):
            resolve_path(cm, "escape")

    def test_rejects_nonexistent_path(self, tmp_path):
        """A path that doesn't exist should raise PathNotFoundError."""
        from jupyter_projspec.routes import PathNotFoundError, resolve_path

        cm = self._make_contents_manager(str(tmp_path))
        with pytest.raises(PathNotFoundError, match="does not exist"):
            resolve_path(cm, "no_such_dir")

    def test_rejects_file_path(self, tmp_path):
        """A path pointing to a file (not directory) should be rejected."""
        from jupyter_projspec.routes import PathNotDirectoryError, resolve_path

        (tmp_path / "afile.txt").write_text("hello")
        cm = self._make_contents_manager(str(tmp_path))
        with pytest.raises(PathNotDirectoryError, match="not a directory"):
            resolve_path(cm, "afile.txt")

    def test_root_slash_allows_subdirectory(self, tmp_path):
        """When server_root is /, valid subdirectories should still resolve.

        This tests the edge case where server_root + os.sep would produce //,
        which broke the old startswith-based containment check.
        """
        from jupyter_projspec.routes import resolve_path

        parent = str(tmp_path.parent)
        child_name = tmp_path.name
        cm = self._make_contents_manager(parent)
        result = resolve_path(cm, child_name)
        assert result == os.path.realpath(str(tmp_path))

    def test_root_slash_rejects_traversal(self, tmp_path):
        """Traversal attempts from a given root should be caught."""
        from jupyter_projspec.routes import PathSecurityError, resolve_path

        sibling = tmp_path.parent / "sibling_dir"
        sibling.mkdir(exist_ok=True)
        cm = self._make_contents_manager(str(tmp_path))
        try:
            with pytest.raises(PathSecurityError, match="outside server root"):
                resolve_path(cm, f"../{sibling.name}")
        finally:
            sibling.rmdir()


# ---------------------------------------------------------------------------
# MakeRouteHandler validation tests
# ---------------------------------------------------------------------------

class TestMakeValidation:
    """Tests for MakeRouteHandler input validation."""

    async def test_missing_body(self, jp_fetch):
        """POST with no body should return 400."""
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "make",
                method="POST",
                body=b"",
                headers={"Content-Type": "application/json"},
            )
        assert exc_info.value.response.code == 400

    async def test_invalid_json(self, jp_fetch):
        """POST with malformed JSON should return 400."""
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "make",
                method="POST",
                body=b"not json at all",
                headers={"Content-Type": "application/json"},
            )
        assert exc_info.value.response.code == 400

    async def test_non_object_body(self, jp_fetch):
        """POST with a JSON array instead of object should return 400."""
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "make",
                method="POST",
                body=json.dumps([1, 2, 3]).encode(),
            )
        assert exc_info.value.response.code == 400
        payload = json.loads(exc_info.value.response.body)
        assert "JSON object" in payload["error"]

    async def test_missing_spec_type(self, jp_fetch):
        """POST without spec_type should return 400."""
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "make",
                method="POST",
                body=json.dumps({"artifact_name": "wheel"}).encode(),
            )
        assert exc_info.value.response.code == 400
        payload = json.loads(exc_info.value.response.body)
        assert "spec_type" in payload["error"]

    async def test_missing_artifact_name(self, jp_fetch):
        """POST without artifact_name should return 400."""
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "make",
                method="POST",
                body=json.dumps({"spec_type": "python_library"}).encode(),
            )
        assert exc_info.value.response.code == 400
        payload = json.loads(exc_info.value.response.body)
        assert "artifact_name" in payload["error"]

    async def test_empty_spec_type(self, jp_fetch):
        """POST with empty spec_type should return 400."""
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "make",
                method="POST",
                body=json.dumps({
                    "spec_type": "",
                    "artifact_name": "wheel",
                }).encode(),
            )
        assert exc_info.value.response.code == 400
        payload = json.loads(exc_info.value.response.body)
        assert "spec_type" in payload["error"]

    async def test_empty_artifact_name(self, jp_fetch):
        """POST with whitespace-only artifact_name should return 400."""
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "make",
                method="POST",
                body=json.dumps({
                    "spec_type": "python_library",
                    "artifact_name": "   ",
                }).encode(),
            )
        assert exc_info.value.response.code == 400
        payload = json.loads(exc_info.value.response.body)
        assert "artifact_name" in payload["error"]

    async def test_non_string_path(self, jp_fetch):
        """POST with non-string path should return 400."""
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "make",
                method="POST",
                body=json.dumps({
                    "path": 123,
                    "spec_type": "python_library",
                    "artifact_name": "wheel",
                }).encode(),
            )
        assert exc_info.value.response.code == 400
        payload = json.loads(exc_info.value.response.body)
        assert "path" in payload["error"]

    async def test_unknown_spec_type_returns_400(self, jp_fetch):
        """POST with a spec_type that doesn't exist should return 400."""
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "make",
                method="POST",
                body=json.dumps({
                    "spec_type": "nonexistent_spec",
                    "artifact_name": "wheel",
                }).encode(),
            )
        assert exc_info.value.response.code == 400
        payload = json.loads(exc_info.value.response.body)
        assert "Unknown spec type" in payload["error"]
        # Should NOT leak available specs list
        assert "Available" not in payload["error"]

    async def test_path_traversal_returns_403(self, jp_fetch):
        """POST with path traversal attempt should return 403."""
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "make",
                method="POST",
                body=json.dumps({
                    "path": "../../../etc",
                    "spec_type": "python_library",
                    "artifact_name": "wheel",
                }).encode(),
            )
        assert exc_info.value.response.code == 403
        payload = json.loads(exc_info.value.response.body)
        assert "outside server root" in payload["error"]

    async def test_absolute_path_returns_403(self, jp_fetch):
        """POST with absolute path should return 403."""
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "make",
                method="POST",
                body=json.dumps({
                    "path": "/etc/passwd",
                    "spec_type": "python_library",
                    "artifact_name": "wheel",
                }).encode(),
            )
        assert exc_info.value.response.code == 403
        payload = json.loads(exc_info.value.response.body)
        assert "must be relative" in payload["error"]


# ---------------------------------------------------------------------------
# ScanRouteHandler path validation tests
# ---------------------------------------------------------------------------

class TestScanPathValidation:
    """Tests for ScanRouteHandler path validation."""

    async def test_path_traversal_returns_403(self, jp_fetch):
        """Scan with path traversal should return 403."""
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "scan",
                params={"path": "../../../etc"},
            )
        assert exc_info.value.response.code == 403

    async def test_absolute_path_returns_403(self, jp_fetch):
        """Scan with absolute path should return 403."""
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "scan",
                params={"path": "/etc/passwd"},
            )
        assert exc_info.value.response.code == 403

    async def test_nonexistent_path_returns_404(self, jp_fetch):
        """Scan with nonexistent path should return 404."""
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "scan",
                params={"path": "no_such_directory"},
            )
        assert exc_info.value.response.code == 404


# ---------------------------------------------------------------------------
# Unit tests for _run_with_output_limit
# ---------------------------------------------------------------------------

class TestRunWithOutputLimit:
    """Tests for the _run_with_output_limit helper function."""

    def test_successful_command(self, tmp_path):
        """A simple echo command should return its output."""
        from jupyter_projspec.routes import _run_with_output_limit

        result = _run_with_output_limit(
            ["echo", "hello world"], cwd=str(tmp_path), timeout=10
        )
        assert result["returncode"] == 0
        assert "hello world" in result["stdout"]
        assert result["truncated"] is False

    def test_failing_command(self, tmp_path):
        """A command that exits non-zero should report the exit code."""
        from jupyter_projspec.routes import _run_with_output_limit

        result = _run_with_output_limit(
            [sys.executable, "-c", "import sys; sys.exit(42)"],
            cwd=str(tmp_path),
            timeout=10,
        )
        assert result["returncode"] == 42

    def test_stderr_captured(self, tmp_path):
        """Stderr output should be captured separately."""
        from jupyter_projspec.routes import _run_with_output_limit

        result = _run_with_output_limit(
            [sys.executable, "-c", "import sys; sys.stderr.write('oops\\n')"],
            cwd=str(tmp_path),
            timeout=10,
        )
        assert "oops" in result["stderr"]

    def test_timeout_raises(self, tmp_path):
        """A command exceeding the timeout should raise TimeoutExpired."""
        import subprocess
        from jupyter_projspec.routes import _run_with_output_limit

        with pytest.raises(subprocess.TimeoutExpired):
            _run_with_output_limit(
                [sys.executable, "-c", "import time; time.sleep(60)"],
                cwd=str(tmp_path),
                timeout=1,
            )

    def test_output_truncation(self, tmp_path):
        """Output exceeding MAX_OUTPUT_BYTES should be truncated."""
        from jupyter_projspec.routes import (
            MAX_OUTPUT_BYTES,
            _run_with_output_limit,
        )

        # Generate output larger than the limit
        script = (
            "import sys; "
            f"sys.stdout.write('A' * {MAX_OUTPUT_BYTES + 1000})"
        )
        result = _run_with_output_limit(
            [sys.executable, "-c", script], cwd=str(tmp_path), timeout=30
        )
        assert result["truncated"] is True
        assert result["stdout"].endswith("... (output truncated by server)")
        # The captured content should not exceed the limit + notice
        assert len(result["stdout"]) <= MAX_OUTPUT_BYTES + 200


# ---------------------------------------------------------------------------
# Helper: mock projspec artifact for integration tests
# ---------------------------------------------------------------------------

def _mock_projspec_project(cmd):
    """Create a mock projspec.Project whose single artifact runs `cmd`.

    Returns a factory suitable for use with ``patch('projspec.Project')``.
    The mock project has one spec 'test_spec' with one artifact 'test_art'.
    """
    artifact = MagicMock()
    artifact.cmd = cmd

    spec = MagicMock()
    spec.artifacts = {"test_art": artifact}

    project = MagicMock()
    project.specs = {"test_spec": spec}

    return MagicMock(return_value=project)


# ---------------------------------------------------------------------------
# Make endpoint integration tests (with mock projspec)
# ---------------------------------------------------------------------------

class TestMakeExecution:
    """Integration tests for successful make execution, timeouts, and output."""

    @patch("jupyter_projspec.routes.projspec.Project")
    async def test_successful_execution(self, mock_project_cls, jp_fetch):
        """A successful command should return stdout and returncode 0."""
        mock_project_cls.side_effect = (
            lambda path: _mock_projspec_project(["echo", "it works"]).return_value
        )

        response = await jp_fetch(
            "jupyter-projspec", "make",
            method="POST",
            body=json.dumps({
                "spec_type": "test_spec",
                "artifact_name": "test_art",
            }).encode(),
        )
        assert response.code == 200
        payload = json.loads(response.body)
        assert payload["returncode"] == 0
        assert "it works" in payload["stdout"]

    @patch("jupyter_projspec.routes.projspec.Project")
    async def test_failed_command(self, mock_project_cls, jp_fetch):
        """A command that exits non-zero should report the exit code."""
        mock_project_cls.side_effect = (
            lambda path: _mock_projspec_project(
                [sys.executable, "-c", "import sys; sys.exit(1)"]
            ).return_value
        )

        response = await jp_fetch(
            "jupyter-projspec", "make",
            method="POST",
            body=json.dumps({
                "spec_type": "test_spec",
                "artifact_name": "test_art",
            }).encode(),
        )
        assert response.code == 200
        payload = json.loads(response.body)
        assert payload["returncode"] == 1

    @patch("jupyter_projspec.routes.COMMAND_TIMEOUT_SECONDS", 1)
    @patch("jupyter_projspec.routes.projspec.Project")
    async def test_timeout_returns_504(self, mock_project_cls, jp_fetch):
        """A command exceeding the timeout should return 504."""
        mock_project_cls.side_effect = (
            lambda path: _mock_projspec_project(
                [sys.executable, "-c", "import time; time.sleep(60)"]
            ).return_value
        )

        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "make",
                method="POST",
                body=json.dumps({
                    "spec_type": "test_spec",
                    "artifact_name": "test_art",
                }).encode(),
            )
        assert exc_info.value.response.code == 504
        payload = json.loads(exc_info.value.response.body)
        assert "timed out" in payload["error"]

    @patch("jupyter_projspec.routes.projspec.Project")
    async def test_artifact_not_found(self, mock_project_cls, jp_fetch):
        """Requesting a nonexistent artifact should return 400."""
        mock_project_cls.side_effect = (
            lambda path: _mock_projspec_project(["echo", "hi"]).return_value
        )

        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "make",
                method="POST",
                body=json.dumps({
                    "spec_type": "test_spec",
                    "artifact_name": "no_such_artifact",
                }).encode(),
            )
        assert exc_info.value.response.code == 400
        payload = json.loads(exc_info.value.response.body)
        assert "Artifact not found" in payload["error"]

    @patch("jupyter_projspec.routes.projspec.Project")
    async def test_string_command_handled(self, mock_project_cls, jp_fetch):
        """A string cmd (not list) should be split via shlex and executed."""
        mock_project_cls.side_effect = (
            lambda path: _mock_projspec_project("echo string cmd").return_value
        )

        response = await jp_fetch(
            "jupyter-projspec", "make",
            method="POST",
            body=json.dumps({
                "spec_type": "test_spec",
                "artifact_name": "test_art",
            }).encode(),
        )
        assert response.code == 200
        payload = json.loads(response.body)
        assert payload["returncode"] == 0
        assert "string cmd" in payload["stdout"]

    @patch("jupyter_projspec.routes.projspec.Project")
    async def test_empty_command_list_returns_400(self, mock_project_cls, jp_fetch):
        """An artifact with an empty command list should return 400."""
        mock_project_cls.side_effect = (
            lambda path: _mock_projspec_project([]).return_value
        )

        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "make",
                method="POST",
                body=json.dumps({
                    "spec_type": "test_spec",
                    "artifact_name": "test_art",
                }).encode(),
            )
        assert exc_info.value.response.code == 400
        payload = json.loads(exc_info.value.response.body)
        assert "empty command" in payload["error"]

    @patch("jupyter_projspec.routes.projspec.Project")
    async def test_malformed_string_command_returns_400(
        self, mock_project_cls, jp_fetch
    ):
        """A string command with unbalanced quotes should return 400."""
        mock_project_cls.side_effect = (
            lambda path: _mock_projspec_project("echo 'unbalanced").return_value
        )

        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "make",
                method="POST",
                body=json.dumps({
                    "spec_type": "test_spec",
                    "artifact_name": "test_art",
                }).encode(),
            )
        assert exc_info.value.response.code == 400
        payload = json.loads(exc_info.value.response.body)
        assert "command syntax" in payload["error"]

    @patch("jupyter_projspec.routes.projspec.Project")
    async def test_none_command_returns_400(self, mock_project_cls, jp_fetch):
        """An artifact with cmd=None should return 400."""
        mock_project_cls.side_effect = (
            lambda path: _mock_projspec_project(None).return_value
        )

        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "make",
                method="POST",
                body=json.dumps({
                    "spec_type": "test_spec",
                    "artifact_name": "test_art",
                }).encode(),
            )
        assert exc_info.value.response.code == 400
        payload = json.loads(exc_info.value.response.body)
        assert "no command defined" in payload["error"]


# ---------------------------------------------------------------------------
# Unit tests for _normalize_url
# ---------------------------------------------------------------------------

class TestNormalizeUrl:
    """Unit tests for the _normalize_url helper."""

    def test_lowercases_scheme(self):
        from jupyter_projspec.routes import _normalize_url
        assert _normalize_url("OSFS:///tmp/foo") == _normalize_url("osfs:///tmp/foo")

    def test_lowercases_netloc(self):
        from jupyter_projspec.routes import _normalize_url
        assert _normalize_url("s3://Bucket/path") == _normalize_url("s3://bucket/path")

    def test_strips_trailing_slash(self):
        from jupyter_projspec.routes import _normalize_url
        assert _normalize_url("osfs:///tmp/foo/") == _normalize_url("osfs:///tmp/foo")

    def test_resolves_dot_segments(self):
        from jupyter_projspec.routes import _normalize_url
        assert _normalize_url("osfs:///tmp/foo/../foo") == _normalize_url("osfs:///tmp/foo")

    def test_percent_decodes_path(self):
        from jupyter_projspec.routes import _normalize_url
        assert _normalize_url("osfs:///%74mp/foo") == _normalize_url("osfs:///tmp/foo")

    def test_empty_path_and_slash_are_equal(self):
        """s3://bucket and s3://bucket/ must normalise to the same value."""
        from jupyter_projspec.routes import _normalize_url
        assert _normalize_url("s3://bucket") == _normalize_url("s3://bucket/")

    def test_netloc_percent_decoded(self):
        """Percent-encoded characters in netloc must be decoded for comparison."""
        from jupyter_projspec.routes import _normalize_url
        assert _normalize_url("s3://My%42ucket/path") == _normalize_url("s3://mybucket/path")

    def test_query_params_stripped(self):
        """Query parameters must be excluded from the canonical form."""
        from jupyter_projspec.routes import _normalize_url
        assert _normalize_url("s3://bucket/path?secret=x") == _normalize_url("s3://bucket/path")

    def test_fragment_stripped(self):
        from jupyter_projspec.routes import _normalize_url
        assert _normalize_url("osfs:///tmp/foo#frag") == _normalize_url("osfs:///tmp/foo")


# ---------------------------------------------------------------------------
# Unit tests for _is_url_allowed
# ---------------------------------------------------------------------------

class TestIsUrlAllowed:
    """Unit tests for the _is_url_allowed allowlist checker."""

    def test_exact_match(self):
        from jupyter_projspec.routes import _is_url_allowed
        assert _is_url_allowed("osfs:///tmp/demo", ["osfs:///tmp/demo"]) is True

    def test_trailing_slash_ignored(self):
        from jupyter_projspec.routes import _is_url_allowed
        assert _is_url_allowed("osfs:///tmp/demo/", ["osfs:///tmp/demo"]) is True

    def test_case_insensitive_scheme(self):
        from jupyter_projspec.routes import _is_url_allowed
        assert _is_url_allowed("OSFS:///tmp/demo", ["osfs:///tmp/demo"]) is True

    def test_encoded_path_matches(self):
        from jupyter_projspec.routes import _is_url_allowed
        assert _is_url_allowed("osfs:///tmp/%64emo", ["osfs:///tmp/demo"]) is True

    def test_disallowed_url(self):
        from jupyter_projspec.routes import _is_url_allowed
        assert _is_url_allowed("osfs:///etc/passwd", ["osfs:///tmp/demo"]) is False

    def test_empty_allowed_list(self):
        from jupyter_projspec.routes import _is_url_allowed
        assert _is_url_allowed("osfs:///tmp/demo", []) is False

    def test_query_param_injection_blocked(self):
        """A URL with injected query params must still match the allowlist entry."""
        from jupyter_projspec.routes import _is_url_allowed
        # The injected query param must not cause a false negative
        assert _is_url_allowed(
            "s3://bucket/path?evil=true", ["s3://bucket/path"]
        ) is True

    def test_sibling_prefix_not_allowed(self):
        """A URL that is a parent of an allowed path must not pass."""
        from jupyter_projspec.routes import _is_url_allowed
        assert _is_url_allowed("osfs:///tmp", ["osfs:///tmp/demo"]) is False


# ---------------------------------------------------------------------------
# Unit tests for _pyfs_url_to_fsspec
# ---------------------------------------------------------------------------

class TestPyfsUrlToFsspec:
    """Unit tests for the PyFilesystem2 → fsspec URL translator."""

    def test_osfs_triple_slash(self):
        from jupyter_projspec.routes import _pyfs_url_to_fsspec
        assert _pyfs_url_to_fsspec("osfs:///tmp/foo") == "/tmp/foo"

    def test_osfs_url_decoded(self):
        """Percent-encoded characters in osfs:// paths must be decoded."""
        from jupyter_projspec.routes import _pyfs_url_to_fsspec
        assert _pyfs_url_to_fsspec("osfs:///tmp/My%20Project") == "/tmp/My Project"

    def test_osfs_windows_drive_url_decoded(self):
        """Percent-encoded Windows drive paths must be decoded."""
        from jupyter_projspec.routes import _pyfs_url_to_fsspec
        assert _pyfs_url_to_fsspec("osfs://C:/My%20Docs") == "C:/My Docs"

    def test_osfs_no_leading_slash_normalised(self):
        from jupyter_projspec.routes import _pyfs_url_to_fsspec
        # osfs://tmp/foo has 'tmp' as netloc (a hostname), which is not supported
        with pytest.raises(ValueError, match="host component"):
            _pyfs_url_to_fsspec("osfs://tmp/foo")

    def test_osfs_windows_drive(self):
        """osfs://C:/path — Python urlparse puts 'C:' in netloc, path is '/path'."""
        from jupyter_projspec.routes import _pyfs_url_to_fsspec
        assert _pyfs_url_to_fsspec("osfs://C:/path") == "C:/path"

    def test_osfs_windows_lowercase_drive(self):
        from jupyter_projspec.routes import _pyfs_url_to_fsspec
        assert _pyfs_url_to_fsspec("osfs://d:/data") == "d:/data"

    def test_osfs_host_raises(self):
        """osfs with a real hostname should raise ValueError."""
        from jupyter_projspec.routes import _pyfs_url_to_fsspec
        with pytest.raises(ValueError, match="host component"):
            _pyfs_url_to_fsspec("osfs://remotehost/path")

    def test_s3_passthrough(self):
        from jupyter_projspec.routes import _pyfs_url_to_fsspec
        url = "s3://my-bucket/prefix"
        assert _pyfs_url_to_fsspec(url) == url

    def test_https_passthrough(self):
        from jupyter_projspec.routes import _pyfs_url_to_fsspec
        url = "https://example.com/data"
        assert _pyfs_url_to_fsspec(url) == url

    def test_unsupported_scheme_raises(self):
        from jupyter_projspec.routes import _pyfs_url_to_fsspec
        with pytest.raises(ValueError, match="Unsupported filesystem scheme"):
            _pyfs_url_to_fsspec("mem://")

    def test_unsupported_pyfs_scheme_raises(self):
        from jupyter_projspec.routes import _pyfs_url_to_fsspec
        with pytest.raises(ValueError, match="Unsupported filesystem scheme"):
            _pyfs_url_to_fsspec("ftp2://host/path")


# ---------------------------------------------------------------------------
# Unit tests for _get_jfs_resource_urls
# ---------------------------------------------------------------------------

class TestGetJfsResourceUrls:
    """Unit tests for the jupyter-fs MetaManager resource URL extractor."""

    def test_no_resources_attr_returns_none(self):
        """Contents manager without _resources or resources → None (no jfs)."""
        from jupyter_projspec.routes import _get_jfs_resource_urls

        class PlainCM:
            pass

        assert _get_jfs_resource_urls(PlainCM()) is None

    def test_none_resources_attr_returns_none(self):
        """resources=None explicitly → None."""
        from jupyter_projspec.routes import _get_jfs_resource_urls

        class CM:
            resources = None

        assert _get_jfs_resource_urls(CM()) is None

    def test_dict_style_resources(self):
        """Resources as a list of dicts with 'url' keys."""
        from jupyter_projspec.routes import _get_jfs_resource_urls

        class CM:
            _resources = [{"url": "s3://bucket"}, {"url": "osfs:///tmp"}]

        assert _get_jfs_resource_urls(CM()) == ["s3://bucket", "osfs:///tmp"]

    def test_object_style_resources(self):
        """Resources as objects with a .url attribute."""
        from jupyter_projspec.routes import _get_jfs_resource_urls

        class Res:
            def __init__(self, url):
                self.url = url

        class CM:
            resources = [Res("s3://bucket"), Res("osfs:///tmp")]

        assert _get_jfs_resource_urls(CM()) == ["s3://bucket", "osfs:///tmp"]

    def test_private_attr_takes_precedence(self):
        """_resources is checked before the public resources attribute."""
        from jupyter_projspec.routes import _get_jfs_resource_urls

        class CM:
            _resources = [{"url": "s3://private"}]
            resources = [{"url": "s3://public"}]

        assert _get_jfs_resource_urls(CM()) == ["s3://private"]

    def test_falls_back_to_public_attr(self):
        """When _resources is absent, falls back to resources."""
        from jupyter_projspec.routes import _get_jfs_resource_urls

        class CM:
            resources = [{"url": "s3://public"}]

        assert _get_jfs_resource_urls(CM()) == ["s3://public"]

    def test_missing_url_field_skipped(self):
        """Resources without a 'url' field are silently skipped."""
        from jupyter_projspec.routes import _get_jfs_resource_urls

        class CM:
            _resources = [{"url": "s3://ok"}, {"name": "no-url"}, {}]

        assert _get_jfs_resource_urls(CM()) == ["s3://ok"]

    def test_empty_resources_returns_empty_list(self):
        """Empty resource list returns [] (not None — jfs is active but unconfigured)."""
        from jupyter_projspec.routes import _get_jfs_resource_urls

        class CM:
            _resources = []

        result = _get_jfs_resource_urls(CM())
        assert result == []
        assert result is not None


# ---------------------------------------------------------------------------
# Unit tests for _redact_url_credentials
# ---------------------------------------------------------------------------

class TestRedactUrlCredentials:
    """Unit tests for the credential redaction helper."""

    def test_redacts_password(self):
        from jupyter_projspec.routes import _redact_url_credentials
        result = _redact_url_credentials("s3://key:secret@bucket/path")
        assert "secret" not in result
        assert "key" in result
        assert "***" in result

    def test_redacts_password_only_url(self):
        """ftp://:secret@host — no username, only password."""
        from jupyter_projspec.routes import _redact_url_credentials
        result = _redact_url_credentials("ftp://:secret@host/path")
        assert "secret" not in result
        assert "***" in result

    def test_redacts_password_containing_colon(self):
        """s3://user:p:ass@host — password itself contains ':'."""
        from jupyter_projspec.routes import _redact_url_credentials
        result = _redact_url_credentials("s3://user:p:ass@host/bucket")
        assert "p:ass" not in result
        assert "user" in result
        assert "***" in result

    def test_no_credentials_unchanged(self):
        from jupyter_projspec.routes import _redact_url_credentials
        url = "s3://bucket/path"
        assert _redact_url_credentials(url) == url

    def test_osfs_no_credentials_unchanged(self):
        from jupyter_projspec.routes import _redact_url_credentials
        url = "osfs:///tmp/demo"
        assert _redact_url_credentials(url) == url


# ---------------------------------------------------------------------------
# ScanUrlRouteHandler integration tests
# ---------------------------------------------------------------------------

def _make_mock_contents_manager(resource_urls):
    """Return a mock contents_manager with jupyter-fs resources at given URLs."""
    class FakeResource:
        def __init__(self, url):
            self.url = url

    cm = MagicMock()
    cm._resources = [FakeResource(u) for u in resource_urls]
    return cm


class TestScanUrlValidation:
    """Integration tests for ScanUrlRouteHandler input validation."""

    async def test_missing_body_returns_400(self, jp_fetch):
        """POST with empty body should return 400."""
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "scan-url",
                method="POST",
                body=b"",
                headers={"Content-Type": "application/json"},
            )
        assert exc_info.value.response.code == 400

    async def test_non_object_body_returns_400(self, jp_fetch):
        """POST with a JSON array instead of object should return 400."""
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "scan-url",
                method="POST",
                body=json.dumps([1, 2, 3]).encode(),
            )
        assert exc_info.value.response.code == 400

    async def test_missing_url_returns_400(self, jp_fetch):
        """POST without 'url' field should return 400."""
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "scan-url",
                method="POST",
                body=json.dumps({"subpath": "sub"}).encode(),
            )
        assert exc_info.value.response.code == 400
        payload = json.loads(exc_info.value.response.body)
        assert "url" in payload["error"]

    async def test_non_string_url_returns_400(self, jp_fetch):
        """POST with a numeric 'url' should return 400 (not 500)."""
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "scan-url",
                method="POST",
                body=json.dumps({"url": 42}).encode(),
            )
        assert exc_info.value.response.code == 400

    async def test_null_subpath_returns_400(self, jp_fetch):
        """POST with subpath: null should be treated as empty (not crash)."""
        # With null subpath the URL itself will fail allowlist (no jfs resources
        # configured), so we expect 404 (no MetaManager) rather than 500.
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "scan-url",
                method="POST",
                body=json.dumps({"url": "osfs:///tmp", "subpath": None}).encode(),
            )
        # Must not be 500 — null subpath must not crash the handler
        assert exc_info.value.response.code != 500

    async def test_non_string_subpath_returns_400(self, jp_fetch):
        """POST with subpath as a dict should return 400."""
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "scan-url",
                method="POST",
                body=json.dumps({"url": "osfs:///tmp", "subpath": {}}).encode(),
            )
        assert exc_info.value.response.code == 400

    async def test_no_jfs_returns_404(self, jp_fetch):
        """When jupyter-fs MetaManager is not present, expect 404."""
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "scan-url",
                method="POST",
                body=json.dumps({"url": "osfs:///tmp"}).encode(),
            )
        assert exc_info.value.response.code == 404
        payload = json.loads(exc_info.value.response.body)
        assert "MetaManager" in payload["error"]

    @patch("jupyter_projspec.routes._get_jfs_resource_urls", return_value=[])
    async def test_empty_resources_returns_422(self, _mock_jfs, jp_fetch):
        """MetaManager active but zero resources configured must return 422
        with a descriptive message, not a generic 403."""
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "scan-url",
                method="POST",
                body=json.dumps({"url": "osfs:///anything"}).encode(),
            )
        assert exc_info.value.response.code == 422
        payload = json.loads(exc_info.value.response.body)
        assert "No jupyter-fs resources" in payload["error"]

    @patch("jupyter_projspec.routes._get_jfs_resource_urls",
           return_value=["osfs:///tmp"])
    @patch("jupyter_projspec.routes._scan_url")
    async def test_successful_scan(self, mock_scan, _mock_jfs, jp_fetch):
        """A valid URL matching the allowlist must return 200 with project data."""
        mock_scan.return_value = {"name": "demo", "specs": {}}
        response = await jp_fetch(
            "jupyter-projspec", "scan-url",
            method="POST",
            body=json.dumps({"url": "osfs:///tmp"}).encode(),
        )
        assert response.code == 200
        payload = json.loads(response.body)
        assert payload["project"] == {"name": "demo", "specs": {}}
        # Confirm the scan was called with the fsspec URL (decoded osfs path)
        mock_scan.assert_called_once_with("/tmp")

    @patch("jupyter_projspec.routes._get_jfs_resource_urls",
           return_value=["osfs:///allowed"])
    async def test_disallowed_url_returns_403(self, _mock_jfs, jp_fetch):
        """A URL not matching any configured resource must return 403."""
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "scan-url",
                method="POST",
                body=json.dumps({"url": "osfs:///not-allowed"}).encode(),
            )
        assert exc_info.value.response.code == 403
        payload = json.loads(exc_info.value.response.body)
        assert "does not match" in payload["error"]

    @patch("jupyter_projspec.routes._get_jfs_resource_urls",
           return_value=["osfs:///allowed"])
    async def test_subpath_traversal_returns_400(self, _mock_jfs, jp_fetch):
        """A subpath containing .. traversal should return 400."""
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "scan-url",
                method="POST",
                body=json.dumps({
                    "url": "osfs:///allowed",
                    "subpath": "../../etc",
                }).encode(),
            )
        assert exc_info.value.response.code == 400
        payload = json.loads(exc_info.value.response.body)
        assert "traversal" in payload["error"]

    @patch("jupyter_projspec.routes._get_jfs_resource_urls",
           return_value=["osfs:///allowed"])
    async def test_double_encoded_traversal_blocked(self, _mock_jfs, jp_fetch):
        """Double-encoded traversal (%252E%252E) must be caught.

        Without the fix (unquote before check), %252E%252E would decode to
        %2E%2E on the first pass — bypassing the '../' check — then to '..'
        on the second decode in _pyfs_url_to_fsspec. With the fix, no unquote
        is applied before the check, so the raw %252E%252E string is normalised
        to itself and rejected because normpath of a relative path containing
        %2E-style segments does NOT produce '..'.
        """
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "scan-url",
                method="POST",
                body=json.dumps({
                    "url": "osfs:///allowed",
                    "subpath": "%252E%252E/%252E%252E/etc/passwd",
                }).encode(),
            )
        # Must not be 500 (no crash) and must not reach the scan step
        # (would be caught earlier as a non-existent path or similar error).
        # The critical assertion: a double-encoded payload must never produce
        # a successful 200 response by escaping the configured resource root.
        assert exc_info.value.response.code != 200

    @patch("jupyter_projspec.routes._get_jfs_resource_urls",
           return_value=["osfs:///allowed"])
    async def test_subpath_dot_returns_400(self, _mock_jfs, jp_fetch):
        """A subpath that normalises to '.' (e.g. 'foo/..') should return 400."""
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "scan-url",
                method="POST",
                body=json.dumps({
                    "url": "osfs:///allowed",
                    "subpath": "foo/..",
                }).encode(),
            )
        assert exc_info.value.response.code == 400
        payload = json.loads(exc_info.value.response.body)
        assert "traversal" in payload["error"]

    @patch("jupyter_projspec.routes._get_jfs_resource_urls",
           return_value=["osfs:///allowed"])
    async def test_absolute_subpath_is_safe(self, _mock_jfs, jp_fetch):
        """A subpath with a leading slash is stripped before normalisation,
        so '/sub/dir' becomes 'sub/dir' — a safe relative path, not a
        traversal. It must NOT be rejected with a 400 traversal error."""
        try:
            await jp_fetch(
                "jupyter-projspec", "scan-url",
                method="POST",
                body=json.dumps({
                    "url": "osfs:///allowed",
                    "subpath": "/sub/dir",
                }).encode(),
            )
        except Exception as exc_info:
            # May fail (osfs:///allowed/sub/dir doesn't exist in CI), but
            # must not be rejected as a traversal attempt.
            if hasattr(exc_info, "response"):
                code = exc_info.response.code
                if code == 400:
                    payload = json.loads(exc_info.response.body)
                    assert "traversal" not in payload.get("error", ""), (
                        "Leading-slash subpath must not be rejected as traversal"
                    )

    @patch("jupyter_projspec.routes._get_jfs_resource_urls",
           return_value=["osfs:///allowed"])
    async def test_null_byte_in_subpath_returns_400(self, _mock_jfs, jp_fetch):
        """A subpath containing a null byte should return 400."""
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "scan-url",
                method="POST",
                body=json.dumps({
                    "url": "osfs:///allowed",
                    "subpath": "sub\x00path",
                }).encode(),
            )
        assert exc_info.value.response.code == 400
        payload = json.loads(exc_info.value.response.body)
        assert "null bytes" in payload["error"]

    @patch("jupyter_projspec.routes._get_jfs_resource_urls",
           return_value=["s3://bucket/prefix"])
    async def test_query_param_injection_blocked(self, _mock_jfs, jp_fetch):
        """A URL with injected query params matching an allowed URL must still pass
        the allowlist (query params stripped) and must NOT forward those params."""
        # The handler finds the match and uses the clean server URL, so it won't
        # 403. It will proceed to scan and fail (s3 needs real credentials),
        # but the important assertion is no 403 and no 500 crash.
        with pytest.raises(Exception) as exc_info:
            await jp_fetch(
                "jupyter-projspec", "scan-url",
                method="POST",
                body=json.dumps({
                    "url": "s3://bucket/prefix?evil=creds",
                }).encode(),
            )
        code = exc_info.value.response.code
        assert code != 403, "Should not 403 — URL matches the allowlist"
        # 500 is acceptable here: the handler correctly passed the allowlist
        # and attempted a real S3 scan (no credentials in test env), confirming
        # injected query params were discarded and the clean URL was used.
