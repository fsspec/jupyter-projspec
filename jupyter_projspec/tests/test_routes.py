import json


async def test_scan_no_path(jp_fetch):
    """Test scan endpoint with no path parameter (defaults to server root)."""
    response = await jp_fetch("jupyter-projspec", "scan")

    assert response.code == 200
    payload = json.loads(response.body)
    assert "project" in payload
