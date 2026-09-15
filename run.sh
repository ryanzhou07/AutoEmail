#!/usr/bin/env bash
set -e

# Always run from the script's directory (project root)
cd "$(dirname "$0")"

# Pick ONE venv name and stick to it
VENV_DIR="venv"

# Create venv if missing
if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
fi

# Activate venv
source "$VENV_DIR/bin/activate"

# Install/update deps every run (safe). If you want faster, see Option C.
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

# Launch app
exec python -m streamlit run app.py
