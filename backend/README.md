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
