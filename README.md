# Quick Emailer

Streamlit app that sends templated emails through the Gmail API using your own Google OAuth client.

## Setup

1. Create an OAuth client in Google Cloud Console
   (APIs & Services -> Credentials -> Create credentials -> OAuth client ID -> **Desktop app**)
   and enable the **Gmail API** for that project.
2. Copy the env template and fill it in:

   ```bash
   cp .env.example .env
   ```

3. Run the app:

   ```bash
   ./run.sh
   ```

4. Click **Connect Gmail**. The OAuth token is cached at `storage/token.json`.

## Secrets

- `.env`, `credentials/`, and `storage/` are gitignored and dockerignored. Keep them local.
- Never commit `client_secret.json` or `token.json`. A leaked `token.json` lets anyone send mail as you.
- If a secret is ever committed, treat it as compromised: revoke the token and reset the client secret in Google Cloud Console.
