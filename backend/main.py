"""FastAPI application entry point."""

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from backend.gmail_auth import router as gmail_auth_router
from backend.gmail_send import router as gmail_send_router
from backend.supabase_history import router as email_history_router
from backend.supabase_health import SupabaseHealthError, check_supabase_health


load_dotenv(Path(__file__).with_name(".env.local"))

app = FastAPI(title="Quick Emailer API", version="1.0.0")
frontend_origins = [
    origin.strip()
    for origin in os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Google-Access-Token",
    ],
)
app.include_router(gmail_auth_router)
app.include_router(gmail_send_router)
app.include_router(email_history_router)


@app.get("/health", tags=["system"])
def health() -> dict[str, object]:
    """Verify both the API process and its Supabase database connection."""
    try:
        supabase_status = check_supabase_health()
    except SupabaseHealthError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    return {"status": "ok", "supabase": supabase_status}
