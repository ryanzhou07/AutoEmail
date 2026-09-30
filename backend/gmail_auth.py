"""Supabase authentication and Google provider-token dependencies."""

from __future__ import annotations

import os
from typing import Any

import requests
from fastapi import APIRouter, Depends, Header, HTTPException, status
from google.oauth2.credentials import Credentials
from pydantic import BaseModel


SCOPES = ["https://www.googleapis.com/auth/gmail.send"]

router = APIRouter(prefix="/gmail/auth", tags=["gmail-auth"])


class SupabaseUser(BaseModel):
    id: str
    email: str | None = None


class GmailConnectionStatus(BaseModel):
    connected: bool
    user_id: str
    email: str | None = None


def _required_setting(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Server configuration is missing {name}.",
        )
    return value.rstrip("/") if name == "SUPABASE_URL" else value


def _bearer_token(authorization: str | None) -> str:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A Supabase access token is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token.strip()


def get_supabase_access_token(
    authorization: str | None = Header(default=None),
) -> str:
    """Return the Supabase bearer token supplied by the frontend."""
    return _bearer_token(authorization)


def get_supabase_user(
    access_token: str = Depends(get_supabase_access_token),
) -> SupabaseUser:
    """Verify the bearer token with Supabase Auth and return its user."""
    supabase_url = _required_setting("SUPABASE_URL")
    publishable_key = _required_setting("SUPABASE_PUBLISHABLE_KEY")

    try:
        response = requests.get(
            f"{supabase_url}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "apikey": publishable_key,
            },
            timeout=10,
        )
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase Auth is temporarily unavailable.",
        ) from exc

    if response.status_code in (401, 403):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="The Supabase session is invalid or expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not response.ok:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase Auth could not verify the session.",
        )

    payload: dict[str, Any] = response.json()
    return SupabaseUser(id=payload["id"], email=payload.get("email"))


def get_verified_supabase_access_token(
    access_token: str = Depends(get_supabase_access_token),
    _: SupabaseUser = Depends(get_supabase_user),
) -> str:
    """Return a bearer token only after Supabase has verified its user."""
    return access_token


def get_creds(
    _: SupabaseUser = Depends(get_supabase_user),
    google_access_token: str | None = Header(
        default=None, alias="X-Gmail-Provider-Token"
    ),
) -> Credentials:
    """Build Gmail credentials from the signed-in user's Google provider token."""
    if not google_access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "The Google provider token is missing. Sign out and sign in with "
                "Google again."
            ),
        )
    return Credentials(token=google_access_token, scopes=SCOPES)


@router.get("/status", response_model=GmailConnectionStatus)
def gmail_auth_status(
    user: SupabaseUser = Depends(get_supabase_user),
    google_access_token: str | None = Header(
        default=None, alias="X-Gmail-Provider-Token"
    ),
) -> GmailConnectionStatus:
    """Report whether this Supabase session also has a Google provider token."""
    return GmailConnectionStatus(
        connected=bool(google_access_token),
        user_id=user.id,
        email=user.email,
    )
