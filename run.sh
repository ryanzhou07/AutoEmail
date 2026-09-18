#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
VENV_DIR="${VENV_DIR:-$BACKEND_DIR/.venv}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to run the frontend." >&2
  exit 1
fi

if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

"$VENV_DIR/bin/python" -m pip install \
  --disable-pip-version-check \
  -r "$BACKEND_DIR/requirements.txt"

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  npm --prefix "$FRONTEND_DIR" install
fi

uvicorn_args=(
  backend.main:app
  --host "$BACKEND_HOST"
  --port "$BACKEND_PORT"
)

if [[ "${UVICORN_RELOAD:-true}" == "true" ]]; then
  uvicorn_args+=(--reload)
fi

cleanup() {
  if [[ -n "${backend_pid:-}" ]]; then
    kill "$backend_pid" 2>/dev/null || true
    wait "$backend_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

cd "$PROJECT_DIR"
"$VENV_DIR/bin/python" -m uvicorn "${uvicorn_args[@]}" &
backend_pid=$!

export VITE_DEV_API_PROXY="${VITE_DEV_API_PROXY:-http://$BACKEND_HOST:$BACKEND_PORT}"

echo "FastAPI:  http://$BACKEND_HOST:$BACKEND_PORT"
echo "Frontend: http://$FRONTEND_HOST:$FRONTEND_PORT"

npm --prefix "$FRONTEND_DIR" run dev -- \
  --host "$FRONTEND_HOST" \
  --port "$FRONTEND_PORT" \
  --strictPort
