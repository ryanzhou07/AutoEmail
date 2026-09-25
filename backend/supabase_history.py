"""Authenticated email campaign and recipient history endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

import requests
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from backend.gmail_auth import (
    _required_setting,
    get_verified_supabase_access_token,
)


router = APIRouter(prefix="/email-history", tags=["email-history"])

CampaignStatus = Literal[
    "draft",
    "scheduled",
    "sending",
    "completed",
    "completed_with_errors",
    "cancelled",
    "failed",
]
RecipientStatus = Literal["queued", "sending", "sent", "failed", "cancelled"]


class CampaignSummary(BaseModel):
    id: UUID
    name: str
    sender_email: str | None = None
    subject_template: str
    status: CampaignStatus
    scheduled_at: datetime | None = None
    scheduled_timezone: str | None = None
    total_count: int
    sent_count: int
    failed_count: int
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class CampaignDetail(CampaignSummary):
    body_template: str


class RecipientDetail(BaseModel):
    id: UUID
    campaign_id: UUID
    source_row_number: int | None = None
    email_address: str
    recipient_name: str | None = None
    merge_data: dict[str, Any] = Field(default_factory=dict)
    rendered_subject: str | None = None
    rendered_body: str | None = None
    status: RecipientStatus
    gmail_message_id: str | None = None
    error_message: str | None = None
    attempt_count: int
    sent_at: datetime | None = None
    created_at: datetime


class CampaignListResponse(BaseModel):
    items: list[CampaignSummary]
    total: int
    limit: int
    offset: int


class RecipientListResponse(BaseModel):
    items: list[RecipientDetail]
    total: int
    limit: int
    offset: int


CAMPAIGN_SUMMARY_COLUMNS = ",".join(
    (
        "id",
        "name",
        "sender_email",
        "subject_template",
        "status",
        "scheduled_at",
        "scheduled_timezone",
        "total_count",
        "sent_count",
        "failed_count",
        "started_at",
        "completed_at",
        "created_at",
        "updated_at",
    )
)
CAMPAIGN_DETAIL_COLUMNS = f"{CAMPAIGN_SUMMARY_COLUMNS},body_template"
RECIPIENT_COLUMNS = ",".join(
    (
        "id",
        "campaign_id",
        "source_row_number",
        "email_address",
        "recipient_name",
        "merge_data",
        "rendered_subject",
        "rendered_body",
        "status",
        "gmail_message_id",
        "error_message",
        "attempt_count",
        "sent_at",
        "created_at",
    )
)


def _rest_headers(access_token: str, *, exact_count: bool = False) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {access_token}",
        "apikey": _required_setting("SUPABASE_PUBLISHABLE_KEY"),
    }
    if exact_count:
        headers["Prefer"] = "count=exact"
    return headers


def _table_url(table: str) -> str:
    return f"{_required_setting('SUPABASE_URL')}/rest/v1/{table}"


def _get_rows(
    table: str,
    access_token: str,
    params: dict[str, str | int],
    *,
    exact_count: bool = False,
) -> tuple[list[dict[str, Any]], int | None]:
    """Read rows through PostgREST so the user's RLS policies are enforced."""
    try:
        response = requests.get(
            _table_url(table),
            headers=_rest_headers(access_token, exact_count=exact_count),
            params=params,
            timeout=15,
        )
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase Database is temporarily unavailable.",
        ) from exc

    if response.status_code in (401, 403):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="The Supabase session is invalid, expired, or unauthorized.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not response.ok:
        detail = "Supabase Database could not retrieve email history."
        if response.status_code == 404:
            detail += " Apply the project migrations first."
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)

    rows = response.json()
    if not isinstance(rows, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Supabase Database returned an unexpected response.",
        )
    return rows, _content_range_total(response.headers.get("Content-Range"))


def _content_range_total(content_range: str | None) -> int | None:
    if not content_range or "/" not in content_range:
        return None
    total = content_range.rsplit("/", 1)[1]
    return int(total) if total.isdigit() else None


def _campaign_or_404(campaign_id: UUID, access_token: str) -> CampaignDetail:
    rows, _ = _get_rows(
        "email_campaigns",
        access_token,
        {
            "select": CAMPAIGN_DETAIL_COLUMNS,
            "id": f"eq.{campaign_id}",
            "limit": 1,
        },
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Email campaign not found.")
    return CampaignDetail.model_validate(rows[0])


def _list_campaigns(
    access_token: str,
    campaign_status: CampaignStatus | None,
    limit: int,
    offset: int,
) -> CampaignListResponse:
    params: dict[str, str | int] = {
        "select": CAMPAIGN_SUMMARY_COLUMNS,
        "order": "created_at.desc",
        "limit": limit,
        "offset": offset,
    }
    if campaign_status:
        params["status"] = f"eq.{campaign_status}"
    rows, total = _get_rows(
        "email_campaigns", access_token, params, exact_count=True
    )
    return CampaignListResponse(
        items=[CampaignSummary.model_validate(row) for row in rows],
        total=total if total is not None else len(rows),
        limit=limit,
        offset=offset,
    )


@router.get("/campaigns", response_model=CampaignListResponse)
def list_campaigns(
    campaign_status: CampaignStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    access_token: str = Depends(get_verified_supabase_access_token),
) -> CampaignListResponse:
    """List the signed-in user's email campaigns, newest first."""
    return _list_campaigns(access_token, campaign_status, limit, offset)


@router.get("/scheduled", response_model=CampaignListResponse)
def list_scheduled_campaigns(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    access_token: str = Depends(get_verified_supabase_access_token),
) -> CampaignListResponse:
    """List the signed-in user's scheduled email campaigns."""
    return _list_campaigns(access_token, "scheduled", limit, offset)


@router.get("/campaigns/{campaign_id}", response_model=CampaignDetail)
def get_campaign(
    campaign_id: UUID,
    access_token: str = Depends(get_verified_supabase_access_token),
) -> CampaignDetail:
    """Retrieve one campaign, including its body template."""
    return _campaign_or_404(campaign_id, access_token)


@router.get(
    "/campaigns/{campaign_id}/recipients",
    response_model=RecipientListResponse,
)
def list_campaign_recipients(
    campaign_id: UUID,
    recipient_status: RecipientStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    access_token: str = Depends(get_verified_supabase_access_token),
) -> RecipientListResponse:
    """List delivery results for recipients in one owned campaign."""
    _campaign_or_404(campaign_id, access_token)
    params: dict[str, str | int] = {
        "select": RECIPIENT_COLUMNS,
        "campaign_id": f"eq.{campaign_id}",
        "order": "source_row_number.asc.nullslast,created_at.asc",
        "limit": limit,
        "offset": offset,
    }
    if recipient_status:
        params["status"] = f"eq.{recipient_status}"
    rows, total = _get_rows(
        "email_recipients", access_token, params, exact_count=True
    )
    return RecipientListResponse(
        items=[RecipientDetail.model_validate(row) for row in rows],
        total=total if total is not None else len(rows),
        limit=limit,
        offset=offset,
    )
