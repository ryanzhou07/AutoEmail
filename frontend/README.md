# Quick Emailer frontend

React + TypeScript frontend using Supabase Auth and the Gmail API.

## Run locally

Start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

Copy the frontend environment template before integrating Supabase Auth:

```bash
cp .env.example .env.local
```

The browser uses `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and the
send-only Gmail scope in `VITE_GOOGLE_OAUTH_SCOPES`. These are public browser
configuration values. Never add the Supabase service-role/secret key or Google
OAuth client secret to a `VITE_` variable.

## Supabase and Google setup

1. In Google Cloud, create a Web OAuth client and enable the Gmail API.
2. In Supabase Dashboard, open **Authentication -> Providers -> Google**.
3. Copy the Supabase callback URL shown there into the Google client's
   authorized redirect URIs.
4. Enter the Google client ID and client secret in the Supabase provider page.
5. In **Authentication -> URL Configuration**, set the local Site URL to
   `http://localhost:5173` and add it to the redirect allowlist.
6. Copy the Supabase project URL and publishable key into `.env.local`.

The login button calls Supabase `signInWithOAuth` and requests Google's
`gmail.send` permission at the same time. Immediate sends pass the Supabase
session and returned Google provider access token to the trusted FastAPI
backend; the browser does not call Gmail directly.

### Where credentials belong

| Value | Location |
|---|---|
| Supabase project URL | `frontend/.env.local` |
| Supabase publishable key | `frontend/.env.local` |
| Google OAuth client ID | Supabase Auth Google provider settings |
| Google OAuth client secret | Supabase Auth Google provider settings |
| Supabase service-role/secret key | Future backend secret storage only |
| Google provider refresh token | Future encrypted backend storage only |

Supabase does not persist or refresh Google provider tokens. Immediate sending
works with the provider access token returned during login. Reliable scheduled
or background sending will require sending the provider refresh token once to a
trusted backend and storing it encrypted per Supabase user.

## Build

```bash
npm run build
```

Vite writes the deployable static application to `frontend/dist`. Vercel can
use `npm run build` as the build command and `dist` as the output directory.

## Current scope

- Supabase Google OAuth with Gmail send-only authorization
- Connected-account instructions
- Five-step template, CSV upload, write, preview, and send flow
- Client-side CSV and email validation
- Immediate Gmail sends through the FastAPI backend
- Starter dashboard for sent and scheduled campaign records

Scheduling and dashboard persistence remain frontend placeholders. They need
the future Supabase database, encrypted token storage, and Cloud Tasks
implementation described in the PRD.
