# Quick Emailer

## Why This Exists

Running a student organization (Rutgers TASA) or club often involves emailing hundreds of members every week about events, recaps, and updates. Doing this manually via standard email interfaces leads to:

Copy-pasting errors and forgotten names.

Cluttered inboxes with no unified team history.

Lost institutional knowledge when leadership boards transition each year.

This app solves those issues by giving your board a central dashboard to write, personalize, send, and archive bulk emails effortlessly.
React frontend and FastAPI backend using Supabase Google authentication to send
plain-text messages through the Gmail API.

## Configure Google and Supabase

1. Enable the Gmail API in Google Cloud and create a **Web application** OAuth
   client.
2. In Supabase Dashboard, open **Authentication -> Providers -> Google** and
   enter that Google client ID and secret.
3. Copy the Supabase callback URL shown on that page into the Google client's
   authorized redirect URIs.
4. In **Supabase Authentication -> URL Configuration**, set the Site URL and an
   allowed redirect URL to `http://localhost:5173`.

## Environment files

Backend:

```bash
cp backend/.env.example backend/.env.local
```

Fill in the Supabase project URL and publishable key in the same way found in .env.example

Frontend:

```bash
cp frontend/.env.example frontend/.env.local
```

Fill in the same public Supabase value in the same way found in .env.example. Neither file needs the Google client
secret; that secret belongs in the Supabase Google provider configuration.

## Run locally

Install and start both applications from the repository root:

```bash
./run.sh
```

Open `http://localhost:5173` and select **Continue with Google**. The frontend
sends the Supabase access token and Google's provider access token to FastAPI.
FastAPI verifies the session with Supabase before using the Google token with
Gmail.

Local requests use Vite's `/api` proxy to reach FastAPI at
`http://localhost:8000`. No CORS or production API URL is needed locally.

## Apply database migrations

Database changes live in `supabase/migrations` and are tracked by the Supabase
CLI. From the repository root, authenticate and link this checkout once:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

Preview and apply all pending migrations:

```bash
npx supabase db push --dry-run
npx supabase db push
```

`db push` records each applied migration in Supabase, so later runs only apply
new files. Do not paste these migrations into the Dashboard SQL editor as well,
or the remote migration history and repository can drift apart.

## Email history API

All history routes require the same `Authorization: Bearer <supabase-jwt>`
header as the Gmail routes. The API forwards that user JWT to Supabase, so the
database Row Level Security policies only return records owned by that user.

- `GET /email-history/campaigns` lists campaigns. Optional query parameters:
  `status`, `limit`, and `offset`.
- `GET /email-history/campaigns/{campaign_id}` returns one campaign, including
  its body template.
- `GET /email-history/campaigns/{campaign_id}/recipients` lists its recipient
  delivery records. Optional query parameters: `status`, `limit`, and `offset`.
- `GET /email-history/scheduled` lists scheduled campaigns.

Interactive API documentation is available at `http://localhost:8000/docs`.

## Supabase health check

`GET /health` now calls a lightweight Supabase database function and returns
HTTP 503 if the database cannot be reached. Apply the migrations before using
it, then configure an uptime monitor or scheduler to request this endpoint at
your desired interval. The route only runs when it is requested; it does not
create a background scheduler inside the API process.

## Future deployment

- In Vercel, select `frontend` as the Root Directory and set
  `VITE_API_BASE_URL` to the Cloud Run service URL.
- In Cloud Run, deploy `backend` as the source directory and set
  `FRONTEND_ORIGIN` to the Vercel application URL.
- Configure environment variables in each platform. Do not deploy the local
  `.env.local` files.

## Current authentication limitation

Supabase does not store or refresh Google provider tokens. Until encrypted
per-user token storage is added, users must sign out and sign in again after
their Google provider token expires. Do not use this temporary approach for
scheduled or unattended sends.
