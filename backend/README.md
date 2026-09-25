# Quick Emailer backend

FastAPI service intended for Google Cloud Run.

## Local configuration

```bash
cp .env.example .env.local
```

The repository-level `run.sh` starts this API together with the frontend.

## Container

From this directory:

```bash
docker build -t quick-emailer-api .
docker run --rm --env-file .env.local -p 8000:8080 quick-emailer-api
```

For Cloud Run, configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and
`FRONTEND_ORIGIN` as service environment variables rather than uploading
`.env.local`.

The publishable key and the caller's Supabase JWT are also used for email
history reads through PostgREST. A service-role key is deliberately not needed
for these user-facing routes; Row Level Security restricts every query to the
authenticated user's rows.

Apply the repository's SQL migrations from the project root before using the
`/email-history` endpoints. See the root README for the `supabase db push`
commands.
