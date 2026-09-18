"""Gmail message construction and FastAPI send routes."""

from __future__ import annotations

import asyncio
import base64
import re
from email.message import EmailMessage
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from pydantic import BaseModel, Field

from backend.gmail_auth import get_creds


router = APIRouter(prefix="/gmail", tags=["gmail"])
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class EmailRequest(BaseModel):
    to: str = Field(min_length=3, max_length=320)
    subject: str = Field(min_length=1, max_length=998)
    body: str = Field(min_length=1)


class EmailResponse(BaseModel):
    id: str
    thread_id: str | None = None
    label_ids: list[str] = Field(default_factory=list)


def _validate_message(to_email: str, subject: str) -> None:
    if not EMAIL_PATTERN.fullmatch(to_email.strip()):
        raise ValueError("A valid recipient email address is required.")
    if "\r" in subject or "\n" in subject:
        raise ValueError("The subject cannot contain line breaks.")


def create_message(to_email: str, subject: str, body: str) -> dict[str, str]:
    """Build the base64url-encoded RFC 2822 message expected by Gmail."""
    to_email = to_email.strip()
    _validate_message(to_email, subject)

    message = EmailMessage()
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii")
    return {"raw": raw}


def send_email(
    creds: Credentials, to_email: str, subject: str, body: str
) -> dict[str, Any]:
    """Send one plain-text message with the Gmail API."""
    service = build("gmail", "v1", credentials=creds, cache_discovery=False)
    return (
        service.users()
        .messages()
        .send(userId="me", body=create_message(to_email, subject, body))
        .execute()
    )


@router.post(
    "/messages",
    response_model=EmailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def send_gmail_message(
    payload: EmailRequest, creds: Credentials = Depends(get_creds)
) -> EmailResponse:
    """Send one Gmail message without blocking FastAPI's event loop."""
    try:
        result = await asyncio.to_thread(
            send_email, creds, payload.to, payload.subject, payload.body
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except HttpError as exc:
        error_status = getattr(exc.resp, "status", 502)
        if error_status in (401, 403):
            raise HTTPException(
                status_code=401,
                detail="Gmail authorization is invalid or lacks gmail.send permission.",
            ) from exc
        raise HTTPException(
            status_code=502, detail="Gmail could not send the message."
        ) from exc

    return EmailResponse(
        id=result["id"],
        thread_id=result.get("threadId"),
        label_ids=result.get("labelIds", []),
    )
