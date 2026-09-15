import os

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/gmail.send"]

DEFAULT_CLIENT_SECRET_FILE = "credentials/client_secret.json"
DEFAULT_TOKEN_PATH = "storage/token.json"


def _client_config_from_env() -> dict | None:
    """Build an OAuth client config from GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, if both are set."""
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    if not (client_id and client_secret):
        return None

    installed = {
        "client_id": client_id,
        "client_secret": client_secret,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "redirect_uris": ["http://localhost"],
    }
    project_id = os.environ.get("GOOGLE_PROJECT_ID")
    if project_id:
        installed["project_id"] = project_id
    return {"installed": installed}


def _new_flow(client_secret_path: str | None) -> InstalledAppFlow:
    config = _client_config_from_env()
    if config:
        return InstalledAppFlow.from_client_config(config, SCOPES)

    path = client_secret_path or os.environ.get("GOOGLE_CLIENT_SECRET_FILE", DEFAULT_CLIENT_SECRET_FILE)
    if os.path.exists(path):
        return InstalledAppFlow.from_client_secrets_file(path, SCOPES)

    raise RuntimeError(
        "No Google OAuth client configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET "
        "in .env (see .env.example), or set GOOGLE_CLIENT_SECRET_FILE to a client_secret.json "
        f"(default: {DEFAULT_CLIENT_SECRET_FILE})."
    )


def _save_token(creds: Credentials, token_path: str) -> None:
    os.makedirs(os.path.dirname(token_path) or ".", exist_ok=True)
    with open(token_path, "w") as f:
        f.write(creds.to_json())


def get_creds(
    client_secret_path: str | None = None,
    token_path: str | None = None,
) -> Credentials:
    """Return valid Gmail credentials, running the OAuth flow in a browser if needed.

    Config is read from the environment (see .env.example). Explicit arguments override it.
    """
    token_path = token_path or os.environ.get("GOOGLE_TOKEN_PATH", DEFAULT_TOKEN_PATH)
    creds = None

    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, SCOPES)

    if creds and creds.valid:
        return creds

    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        _save_token(creds, token_path)
        return creds

    creds = _new_flow(client_secret_path).run_local_server(port=0)
    _save_token(creds, token_path)
    return creds
