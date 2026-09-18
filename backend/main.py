"""FastAPI application entry point."""

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.gmail_auth import router as gmail_auth_router
from backend.gmail_send import router as gmail_send_router


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
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Google-Access-Token",
    ],
)
app.include_router(gmail_auth_router)
app.include_router(gmail_send_router)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}
