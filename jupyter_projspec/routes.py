import json
import os

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
import projspec
import tornado


class HelloRouteHandler(APIHandler):
    """Handler for the hello endpoint - kept for backwards compatibility."""

    @tornado.web.authenticated
    def get(self):
        self.finish(
            json.dumps(
                {
                    "data": (
                        "Hello, world!"
                        " This is the '/jupyter-projspec/hello' endpoint."
                        " Try visiting me in your browser!"
                    ),
                }
            )
        )


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

    # Hello endpoint (backwards compatibility)
    hello_route_pattern = url_path_join(base_url, "jupyter-projspec", "hello")

    # Scan endpoint for projspec
    scan_route_pattern = url_path_join(base_url, "jupyter-projspec", "scan")

    handlers = [
        (hello_route_pattern, HelloRouteHandler),
        (scan_route_pattern, ScanRouteHandler),
    ]

    web_app.add_handlers(host_pattern, handlers)
