"""Tests for Supabase email-history request handling."""

from __future__ import annotations

import os
import unittest
from unittest.mock import Mock, patch

from backend.main import app
from backend.supabase_history import _content_range_total, _get_rows


class ContentRangeTests(unittest.TestCase):
    def test_extracts_exact_total(self) -> None:
        self.assertEqual(_content_range_total("0-9/27"), 27)

    def test_unknown_or_missing_total_is_none(self) -> None:
        self.assertIsNone(_content_range_total("*/ *"))
        self.assertIsNone(_content_range_total(None))


class SupabaseRequestTests(unittest.TestCase):
    @patch.dict(
        os.environ,
        {
            "SUPABASE_URL": "https://example.supabase.co",
            "SUPABASE_PUBLISHABLE_KEY": "public-key",
        },
        clear=False,
    )
    @patch("backend.supabase_history.requests.get")
    def test_forwards_user_jwt_and_requests_exact_count(self, request_get: Mock) -> None:
        response = Mock()
        response.ok = True
        response.status_code = 200
        response.headers = {"Content-Range": "0-0/1"}
        response.json.return_value = [{"id": "campaign-id"}]
        request_get.return_value = response

        rows, total = _get_rows(
            "email_campaigns",
            "user-jwt",
            {"select": "id"},
            exact_count=True,
        )

        self.assertEqual(rows, [{"id": "campaign-id"}])
        self.assertEqual(total, 1)
        request_get.assert_called_once_with(
            "https://example.supabase.co/rest/v1/email_campaigns",
            headers={
                "Authorization": "Bearer user-jwt",
                "apikey": "public-key",
                "Prefer": "count=exact",
            },
            params={"select": "id"},
            timeout=15,
        )


class RouteRegistrationTests(unittest.TestCase):
    def test_history_routes_are_in_openapi_schema(self) -> None:
        paths = app.openapi()["paths"]
        self.assertIn("/email-history/campaigns", paths)
        self.assertIn("/email-history/campaigns/{campaign_id}", paths)
        self.assertIn(
            "/email-history/campaigns/{campaign_id}/recipients",
            paths,
        )
        self.assertIn("/email-history/scheduled", paths)


if __name__ == "__main__":
    unittest.main()
