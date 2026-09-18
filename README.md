# Quick Emailer

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

Fill in the Supabase project URL and publishable key.

Frontend:

```bash
cp frontend/.env.example frontend/.env.local
```

Fill in the same public Supabase values. Neither file needs the Google client
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
