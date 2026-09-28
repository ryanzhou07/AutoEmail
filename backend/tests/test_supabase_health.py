"""Tests for the Supabase health probe."""

from __future__ import annotations

import os
import unittest
from unittest.mock import Mock, patch

from backend.supabase_health import SupabaseHealthError, check_supabase_health


class SupabaseHealthTests(unittest.TestCase):
    @patch.dict(
        os.environ,
        {
            "SUPABASE_URL": "https://example.supabase.co/",
            "SUPABASE_PUBLISHABLE_KEY": "public-key",
        },
        clear=False,
    )
    @patch("backend.supabase_health.requests.post")
    def test_calls_database_health_rpc(self, request_post: Mock) -> None:
        response = Mock()
        response.ok = True
        response.status_code = 200
        response.json.return_value = "2026-09-25T12:00:00+00:00"
        request_post.return_value = response

        result = check_supabase_health()

        self.assertEqual(result["status"], "ok")
        request_post.assert_called_once_with(
            "https://example.supabase.co/rest/v1/rpc/health_check",
            headers={
                "Authorization": "Bearer public-key",
                "apikey": "public-key",
            },
            json={},
            timeout=10,
        )

    @patch.dict(os.environ, {}, clear=True)
    def test_requires_configuration(self) -> None:
        with self.assertRaises(SupabaseHealthError):
            check_supabase_health()


if __name__ == "__main__":
    unittest.main()
