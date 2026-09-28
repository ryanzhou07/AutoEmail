"""Lightweight Supabase database health probe."""

from __future__ import annotations

import os
from typing import Any

import requests


class SupabaseHealthError(RuntimeError):
    """Raised when the configured Supabase database cannot be reached."""


def check_supabase_health(timeout: int = 10) -> dict[str, Any]:
    """Call the health_check RPC so the probe exercises the database."""
    supabase_url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    publishable_key = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "").strip()
    if not supabase_url or not publishable_key:
        raise SupabaseHealthError("Supabase is not configured.")

    try:
        response = requests.post(
            f"{supabase_url}/rest/v1/rpc/health_check",
            headers={
                "Authorization": f"Bearer {publishable_key}",
                "apikey": publishable_key,
            },
            json={},
            timeout=timeout,
        )
    except requests.RequestException as exc:
        raise SupabaseHealthError("Supabase is unavailable.") from exc

    if not response.ok:
        raise SupabaseHealthError(
            f"Supabase health check failed with status {response.status_code}."
        )

    return {"status": "ok", "database_time": response.json()}
