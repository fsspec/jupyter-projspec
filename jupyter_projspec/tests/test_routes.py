import json
import os
import sys

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
