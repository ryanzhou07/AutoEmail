"""Keep the browser and API aligned on the Gmail token header."""

import unittest

from backend.main import app


class GmailTokenHeaderTests(unittest.TestCase):
    def test_send_and_status_accept_non_reserved_provider_header(self) -> None:
        paths = app.openapi()["paths"]
        for path, method in (
            ("/gmail/messages", "post"),
            ("/gmail/auth/status", "get"),
        ):
            with self.subTest(path=path):
                header_names = {
                    parameter["name"]
                    for parameter in paths[path][method]["parameters"]
                    if parameter["in"] == "header"
                }
                self.assertIn("X-Gmail-Provider-Token", header_names)
                self.assertNotIn("X-Google-Access-Token", header_names)

        cors = next(
            middleware for middleware in app.user_middleware
            if middleware.cls.__name__ == "CORSMiddleware"
        )
        self.assertIn("X-Gmail-Provider-Token", cors.kwargs["allow_headers"])


if __name__ == "__main__":
    unittest.main()
