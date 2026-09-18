# Product Requirements Document: Quick Emailer Refactor

**Status:** Draft for implementation planning  
**Last updated:** 2026-09-17  
**Target platform:** FastAPI on Google Cloud Run, simple web frontend, Supabase, and Google OAuth

## 1. Product summary

Quick Emailer is a lightweight application for sending personalized, plain-text emails through a user's own Gmail account. A user signs in, connects Gmail, uploads a CSV of recipients and merge data, writes a subject and body using placeholders such as `{name}`, previews the rendered messages, confirms the audience, and sends the emails.

The refactor will preserve that core workflow while replacing the current single-process Streamlit application and local OAuth token file with a deployable, multi-user web architecture:

- A small browser-based frontend for authentication, CSV upload, composition, preview, confirmation, progress, and results.
- A FastAPI backend deployed to Google Cloud Run.
- Supabase Auth for application identity and Supabase Postgres for persistent application data.
- A backend-managed Google OAuth web flow for delegated Gmail access.
- The Gmail API for sending mail as the connected user.

The application is a mail-merge sender, not a general email client, marketing automation suite, or SMTP relay.

## 2. Current application assessment

### 2.1 Current behavior

The repository currently contains a Streamlit application with this workflow:

1. Connect a Gmail account using Google OAuth.
2. Optionally send a test message.
3. Download a starter CSV containing `email` plus user-selected merge columns.
4. Upload a completed CSV.
5. Select the recipient email column and validate basic email syntax.
6. Write a subject and plain-text body using `{column_name}` placeholders.
7. Verify that all placeholders exist in the uploaded CSV.
8. Preview the rendered message for any CSV row.
9. Confirm the recipient count and send one Gmail API request per row.
10. Display progress and allow an error report to be downloaded as CSV.

The implementation is concentrated in `app.py`. OAuth is handled by `src/gmail_auth.py`, and Gmail message construction/sending is handled by `src/gmail_send.py`.

### 2.2 Current credentials and configuration

The current code requires one of the following Google OAuth client configurations:

**Option A — environment variables**

- `GOOGLE_CLIENT_ID`: OAuth 2.0 client ID.
- `GOOGLE_CLIENT_SECRET`: OAuth 2.0 client secret.
- `GOOGLE_PROJECT_ID`: optional in the current code. It is metadata, not a secret.

**Option B — downloaded client configuration**

- `GOOGLE_CLIENT_SECRET_FILE`: optional path to a downloaded OAuth client JSON file. The default is `credentials/client_secret.json`.

The current code also uses:

- `GOOGLE_TOKEN_PATH`: optional path for the user's cached OAuth token. The default is `storage/token.json`.
- A token file created after authorization. It contains an access token and normally a refresh token, and must be treated as a high-impact secret because it can authorize sending as the connected user.

Current external setup requirements:

- A Google Cloud project.
- The Gmail API enabled in that project.
- An OAuth consent screen configured for the project.
- An OAuth client currently configured as a **Desktop app**.
- The delegated scope `https://www.googleapis.com/auth/gmail.send`.

No Supabase credentials are used by the current code. `google-cloud-secret-manager` and `google-cloud-firestore` are listed in `requirements.txt` but are not referenced by the application.

### 2.3 Current architectural constraints

- `InstalledAppFlow.run_local_server()` assumes a local browser and loopback callback; it is not the correct OAuth flow for Cloud Run.
- A single token is persisted to a local path. Cloud Run filesystems are ephemeral, instances can scale horizontally, and one shared path cannot safely represent multiple users.
- Streamlit session state holds the uploaded recipient data, draft, and credentials. State disappears when a session or instance ends.
- Sending runs inside the UI request/process. Large sends may exceed request time limits or be interrupted when the client disconnects or an instance restarts.
- There is no durable campaign history, send-attempt log, idempotency control, cancellation model, or retry policy.
- There is no application-level user authentication or authorization boundary.
- CSV contents and exception strings may contain personal data and must not be written indiscriminately to logs.
- The Docker command disables CORS and XSRF protection in Streamlit; these settings must not be carried into the new application.

## 3. Goals

### 3.1 Product goals

- Let an authenticated user send personalized emails from their own Gmail account.
- Make CSV-to-email mail merge simple enough to complete without technical knowledge.
- Prevent accidental sends through validation, preview, an explicit confirmation step, and duplicate-send protection.
- Preserve a durable record of campaigns and per-recipient outcomes.
- Support secure, multi-user deployment on Cloud Run.
- Keep the first version operationally small and understandable.

### 3.2 Technical goals

- Separate the browser UI, API, durable data, and Gmail authorization concerns.
- Authenticate API requests using Supabase-issued user sessions.
- Store one Gmail connection per user, with refresh tokens encrypted at rest and never returned to the browser.
- Make sending resumable and idempotent.
- Keep all server-side secrets in Google Secret Manager or an equivalent managed secret store.
- Use a Cloud Run service account rather than a downloaded Google service-account key.

## 4. Non-goals for the initial release

- Rich HTML or drag-and-drop email design.
- Attachments, inline images, CC, BCC, or reply-to controls.
- Scheduled or recurring campaigns.
- Email open, click, bounce, or reply tracking.
- Contact-list management beyond a campaign CSV.
- SMTP support or non-Gmail sending providers.
- Automated follow-up sequences or marketing automation.
- Team workspaces, shared campaigns, or role-based organization administration.
- AI-generated copy.

## 5. Users and primary use case

### Primary user

An individual who needs to send a modest batch of personalized emails from their own Google Workspace or Gmail account using recipient data maintained in a spreadsheet.

### Primary job to be done

“Given a CSV of recipients and attributes, help me safely create, verify, and send one personalized Gmail message to each valid recipient, then show me exactly what succeeded or failed.”

## 6. Proposed user experience

### 6.1 Sign in

- The user signs in to the application using Google through Supabase Auth.
- The frontend receives a Supabase session and sends its access token as a bearer token to FastAPI.
- FastAPI validates the token and derives the user identity from the verified `sub` claim. It never trusts a user ID supplied separately by the client.

### 6.2 Connect Gmail

- The user selects **Connect Gmail**.
- FastAPI starts a Google OAuth web-server flow using authorization code flow, PKCE where supported, a short-lived state value, `access_type=offline`, and consent behavior sufficient to obtain a refresh token.
- Google redirects to the FastAPI OAuth callback.
- FastAPI exchanges the code server-side, encrypts the refresh token, stores the connection against the authenticated Supabase user, and redirects to the frontend.
- The browser never receives or stores the Gmail refresh token.
- The requested Gmail permission is limited to `gmail.send`.

Application sign-in and Gmail authorization are intentionally separate security concepts. Signing in proves who the user is; connecting Gmail grants permission to send mail. They may use OAuth clients from the same Google Cloud project, but separate OAuth clients are recommended so their redirect URIs, lifecycle, and responsibilities remain clear.

### 6.3 Create a campaign

- The user creates a new campaign and uploads a UTF-8 CSV.
- The UI shows the detected columns, row count, and a limited sample.
- The user chooses the email column.
- The system validates required values, basic email syntax, duplicate addresses, file size, row limit, and column names.
- Invalid rows are shown clearly and block sending until removed or corrected. The user may download a validation report.

### 6.4 Compose and preview

- The user enters a subject and plain-text body.
- Available placeholders are derived from CSV headers and displayed as insertable variables.
- A placeholder must match a column exactly after the documented normalization rules.
- The user can preview any recipient row, including the final recipient address, rendered subject, and rendered body.
- Missing placeholders or render failures block sending.

### 6.5 Confirm and send

- The confirmation screen displays the sender account, total valid recipients, duplicate handling, and the first five recipients.
- The user must perform an explicit final confirmation.
- The backend creates immutable message records or a snapshot of the campaign input before the first Gmail call.
- Each recipient message has a stable idempotency key. Retrying a request or worker must not send an already-successful message again.
- Sending continues independently of the browser connection.
- The UI polls or subscribes for campaign progress and displays queued, sending, sent, failed, and cancelled counts.

### 6.6 Results

- The user can view campaign history and per-recipient status.
- Each successful result stores the Gmail message ID and completion time.
- Each failure stores a safe error category, a sanitized diagnostic message, attempt count, and last-attempt time.
- The user can download a CSV error report.
- A failed message may be retried; a successfully sent message cannot be resent by the retry action.

## 7. Functional requirements

### FR-1: Authentication and authorization

- Supabase Auth must provide application sign-in with Google.
- Every non-public API endpoint must require a valid Supabase access token.
- Every database query must be scoped to the authenticated user.
- Supabase Row Level Security must prevent users from reading or modifying another user's records.
- Logout must clear the frontend session without silently revoking the Gmail connection.

### FR-2: Gmail connection management

- A user can connect, inspect, reconnect, and disconnect a Gmail account.
- The connection screen shows the connected email address, granted scopes, and connection health, but never tokens.
- Disconnecting deletes the stored token material and should attempt to revoke the Google grant.
- An expired access token is refreshed server-side. An invalid or revoked refresh token marks the connection `reauth_required`.
- The backend must reject sending when the `gmail.send` scope is absent.

### FR-3: CSV handling

- Accept `.csv` files only in the first release.
- Support UTF-8, including UTF-8 with BOM.
- Enforce configurable file-size and recipient-row limits before persistence.
- Require at least one row and one selectable email column.
- Preserve the original row number for error reporting.
- Treat uploaded cell contents as untrusted data.
- Do not execute formulas, HTML, scripts, or template expressions from CSV cells.

### FR-4: Templates

- Support placeholders matching `{identifier}`, where an identifier begins with a letter or underscore and contains only letters, digits, or underscores.
- Support placeholders in both subject and body.
- Reject unknown placeholders before sending.
- Render values as plain text.
- The initial release does not support arbitrary Python formatting, expressions, or nested property access.

### FR-5: Validation and preview

- Validate every email address before confirmation.
- Identify blank recipient values and duplicate email addresses.
- Define duplicate behavior explicitly; the recommended default is to block exact duplicates and ask the user to correct the file.
- Allow row-by-row preview before sending.
- Show the sender identity and final recipient count at confirmation.

### FR-6: Sending

- Construct standards-compliant plain-text MIME messages.
- Use Gmail API `users.messages.send` with `userId="me"`.
- Send only after the campaign has been confirmed.
- Persist status transitions and results per recipient.
- Apply bounded concurrency and exponential backoff for transient Gmail errors.
- Do not retry permanent validation, authorization, or recipient errors automatically.
- Respect Gmail API and account sending quotas; the application must not promise delivery beyond Google's limits.
- Ensure at-most-once application behavior for messages already recorded as successful.

### FR-7: Campaign lifecycle

- Supported campaign states: `draft`, `validated`, `queued`, `sending`, `completed`, `completed_with_errors`, `cancelled`, and `failed`.
- A draft can be edited; a queued or sending campaign uses an immutable snapshot.
- Cancellation stops unsent work but cannot recall messages already accepted by Gmail.
- A user can view prior campaigns and delete a draft.
- Retention and deletion behavior for completed campaigns must be configurable and visible to the user.

### FR-8: Test email

- A connected user may send a test message to an explicitly entered address.
- Test messages use the same authorization and send pipeline as campaign messages.
- Test sends must be recorded separately from campaign recipient counts.

## 8. Proposed system architecture

### 8.1 Components

**Frontend**

- A small static single-page application or server-rendered frontend.
- Uses the public Supabase URL and publishable/anon key for authentication only.
- Holds the Supabase session in the supported client library.
- Calls FastAPI over HTTPS with the Supabase access token.
- Never receives the Supabase service-role key, Google OAuth client secret, Gmail refresh token, or Cloud credentials.

**FastAPI service on Cloud Run**

- Validates Supabase JWTs using the project's published JWKS or supported verification mechanism.
- Owns campaign validation, template rendering, authorization checks, Google OAuth code exchange, Gmail token refresh, Gmail sending, and result persistence.
- Reads secrets from Google Secret Manager.
- Runs under a dedicated Cloud Run service account.

**Supabase**

- Provides Auth, Postgres, Row Level Security, and application persistence.
- Stores user-owned campaign data and encrypted Gmail token ciphertext.
- The backend uses a service-role credential only for trusted server operations and still enforces user ownership in application code.

**Google OAuth and Gmail API**

- Google OAuth grants delegated `gmail.send` permission per user.
- Gmail API sends messages as the connected account.

**Background send execution**

- Sending must not depend on an open browser request.
- Preferred MVP: Cloud Tasks dispatches idempotent per-message or small-batch work to a private FastAPI worker endpoint on Cloud Run.
- If Cloud Tasks is deferred for a very small internal pilot, the limitation must be explicit; in-process background tasks are not considered durable production execution.

### 8.2 High-level flow

1. Browser authenticates through Supabase Auth.
2. Browser calls FastAPI with a Supabase bearer token.
3. FastAPI validates the user and reads/writes user-scoped Supabase records.
4. FastAPI completes a separate Google OAuth web flow and stores the Gmail refresh token encrypted.
5. Confirmation creates queued message records.
6. Cloud Tasks invokes an authenticated private worker endpoint.
7. The worker refreshes Google credentials, sends through Gmail, and records the result.
8. The browser reads progress through FastAPI polling or Supabase Realtime with RLS.

## 9. Data model

The exact schema may change during technical design, but the following entities are required.

### `profiles`

- `user_id` — UUID, primary key, references `auth.users`.
- `display_name`.
- `created_at`, `updated_at`.

### `gmail_connections`

- `user_id` — UUID, unique owner.
- `google_subject` — stable Google account identifier.
- `email_address` — display value.
- `encrypted_refresh_token` — ciphertext only.
- `scopes` — granted scope list.
- `status` — `connected`, `reauth_required`, or `revoked`.
- `token_version` — supports key rotation/migration.
- `connected_at`, `last_refreshed_at`, `updated_at`.

Access tokens should normally remain short-lived in memory and not be persisted unless a later design demonstrates a need.

### `campaigns`

- `id` — UUID.
- `user_id` — owner.
- `name`.
- `subject_template`, `body_template`.
- `email_column`.
- `source_filename` and safe import metadata.
- `state`.
- Aggregate counts: total, queued, sent, failed, cancelled.
- `confirmed_at`, `started_at`, `completed_at`, `created_at`, `updated_at`.

### `campaign_recipients`

- `id` — UUID.
- `campaign_id`.
- `source_row_number`.
- `email_address`.
- `merge_data` — JSONB snapshot.
- `rendered_subject`, `rendered_body` or a deterministic immutable rendering input.
- `idempotency_key` — unique.
- `status` — `queued`, `sending`, `sent`, `failed`, or `cancelled`.
- `gmail_message_id`.
- `attempt_count`, `last_error_code`, `last_error_message`.
- `sent_at`, `last_attempt_at`, `created_at`.

### Data ownership and retention

- All user-owned tables must include an owner path enforceable with RLS.
- Raw uploaded files should not be retained after parsing unless product requirements later require it.
- Recipient and message content are personal data. Define a default retention period before launch; 30 or 90 days is recommended for the MVP, with earlier user-initiated deletion where operationally safe.
- Audit logs must record security-relevant events without recording tokens or full email bodies.

## 10. API surface

Illustrative endpoints:

- `GET /healthz` — process health; contains no secret-dependent detail.
- `GET /v1/me` — current application user summary.
- `GET /v1/gmail/connection` — connection status.
- `POST /v1/gmail/oauth/start` — returns or redirects to the Google authorization URL.
- `GET /v1/gmail/oauth/callback` — handles the authorization response.
- `DELETE /v1/gmail/connection` — revoke and disconnect.
- `POST /v1/gmail/test` — send a test message.
- `POST /v1/campaigns` — create a draft.
- `POST /v1/campaigns/{id}/recipients:import` — validate and import CSV data.
- `PATCH /v1/campaigns/{id}` — update a draft template or metadata.
- `GET /v1/campaigns/{id}/preview?row={n}` — render a preview.
- `POST /v1/campaigns/{id}:validate` — run preflight validation.
- `POST /v1/campaigns/{id}:send` — confirm and enqueue once, with an idempotency key.
- `POST /v1/campaigns/{id}:cancel` — cancel unsent work.
- `GET /v1/campaigns/{id}` — campaign state and aggregate progress.
- `GET /v1/campaigns/{id}/recipients` — paginated recipient results.
- `POST /v1/campaigns/{id}/failures:retry` — retry eligible failures only.
- `GET /v1/campaigns/{id}/errors.csv` — download a sanitized error report.
- `POST /internal/send-jobs/{recipient_id}` — private Cloud Tasks worker endpoint.

Mutating endpoints must enforce ownership and use request or resource idempotency where duplicate browser submissions could cause duplicate sends.

## 11. Exact credentials and configuration for the target architecture

This section distinguishes actual secrets from public identifiers and service configuration.

### 11.1 Required secrets

| Secret | Where it is configured | Used by | Purpose |
|---|---|---|---|
| Supabase Google provider client secret | Supabase Auth provider settings | Supabase Auth | Completes Google sign-in for application authentication. |
| `GMAIL_GOOGLE_CLIENT_SECRET` | Google Secret Manager, exposed only to FastAPI | FastAPI | Exchanges Gmail OAuth authorization codes and refreshes delegated credentials. |
| `SUPABASE_SERVICE_ROLE_KEY` | Google Secret Manager, exposed only to FastAPI | FastAPI | Performs trusted server-side Supabase operations. This key bypasses RLS and must never reach the frontend. |

If one Google OAuth web client is deliberately reused for both sign-in and Gmail authorization, its one client secret is entered in Supabase and stored for FastAPI. Separate clients and secrets are recommended.

### 11.2 Required public or non-secret configuration

| Configuration | Used by | Purpose |
|---|---|---|
| `SUPABASE_URL` | Frontend and FastAPI | Supabase project API URL. |
| `SUPABASE_ANON_KEY` or current Supabase publishable key | Frontend | Public client credential constrained by Auth and RLS; safe to expose but not a substitute for correct RLS. |
| `SUPABASE_JWKS_URL` or derivable project URL | FastAPI | Retrieves public keys used to validate Supabase access tokens. |
| Supabase Google provider client ID | Supabase Auth | Identifies the OAuth client used for application sign-in. |
| `GMAIL_GOOGLE_CLIENT_ID` | FastAPI | Identifies the OAuth web client used for Gmail authorization. |
| `GMAIL_GOOGLE_REDIRECT_URI` | FastAPI and Google Cloud Console | Exact HTTPS callback, for example `https://api.example.com/v1/gmail/oauth/callback`. |
| `FRONTEND_URL` | FastAPI | Safe post-OAuth redirect and CORS allowlist origin. |
| `GCP_PROJECT_ID` | Deployment/runtime configuration | Selects the Google Cloud project; not a secret. |
| `GCP_REGION` | Deployment configuration | Cloud Run, Cloud Tasks, and KMS region. |
| `GMAIL_OAUTH_SCOPES` | FastAPI | Must include only `https://www.googleapis.com/auth/gmail.send` for mail sending. |
| `KMS_KEY_RESOURCE` | FastAPI | Full Cloud KMS key resource used to encrypt/decrypt Gmail refresh tokens; not secret itself. |
| `CLOUD_TASKS_QUEUE` | FastAPI | Queue name for durable send work. |
| `CLOUD_RUN_WORKER_URL` | FastAPI/Cloud Tasks | Private worker endpoint target. |
| `MAX_CSV_BYTES`, `MAX_RECIPIENTS_PER_CAMPAIGN`, `SEND_CONCURRENCY` | FastAPI | Configurable safety and workload limits. |

### 11.3 Runtime identity and IAM — required, but not secret files

Create a dedicated Cloud Run service account and attach it to the service. Do not create or upload a long-lived service-account JSON key.

The service account needs narrowly scoped access to:

- Read only the named application secrets from Google Secret Manager.
- Encrypt and decrypt with only the selected Cloud KMS key.
- Enqueue tasks in only the selected Cloud Tasks queue.
- Invoke the private Cloud Run worker endpoint if a separate worker service is used.

Cloud Tasks should use its own service identity or a narrowly scoped invoker identity to call the private worker endpoint. The worker must verify the authenticated caller, not merely rely on an unguessable URL.

### 11.4 Google Cloud Console setup

- Enable Gmail API.
- Configure the OAuth consent screen, branding, support email, privacy policy, and authorized/test users as required by the selected publishing status.
- Create a **Web application** OAuth client for Gmail authorization. Do not reuse the current Desktop client configuration in production.
- Add the exact FastAPI callback URI to authorized redirect URIs.
- Configure the Supabase Auth callback URI on the sign-in OAuth client: `https://<supabase-project-ref>.supabase.co/auth/v1/callback`.
- Add local-development callback URIs explicitly; production must use HTTPS.
- Request only the `gmail.send` scope for Gmail functionality. Google may require OAuth app verification before broad external use.

### 11.5 Supabase setup

- Supabase project URL.
- Public anon/publishable key for the frontend.
- Service-role key for FastAPI only.
- Google provider client ID and secret configured in the Supabase dashboard.
- Allowed site URL and redirect URL allowlist for local, staging, and production frontends.
- Database migrations and RLS policies for every application table.

### 11.6 Developer and CI/CD credentials

These are deployment credentials, not application runtime variables:

- Local developers may use `gcloud auth application-default login` and the Supabase CLI login flow.
- CI/CD should use Workload Identity Federation or the platform's short-lived identity integration.
- Do not store a Google service-account JSON key in the repository or CI variables unless no keyless option exists and a security exception is approved.

### 11.7 Credentials that are not needed

- No Gmail username or password.
- No SMTP password or Google app password.
- No checked-in `client_secret.json`.
- No checked-in or persistent local `token.json` in production.
- No Google service-account key for sending user Gmail; service accounts do not replace delegated user OAuth for this product.
- No Firestore credential if Supabase is the selected database.
- No browser access to `SUPABASE_SERVICE_ROLE_KEY`, Google client secrets, refresh tokens, KMS permissions, or Secret Manager credentials.

## 12. Security, privacy, and abuse requirements

- All production traffic must use HTTPS.
- CORS must allow only the known frontend origins; credentials and methods must be minimal.
- OAuth callbacks must validate state, bind the flow to the authenticated user, reject replay, and use exact allowlisted redirects.
- Gmail refresh tokens must be encrypted before database storage. Cloud KMS is the recommended key boundary; envelope encryption may be added during technical design.
- Secret values and OAuth tokens must never be logged, returned in errors, included in analytics, or stored in browser persistence.
- CSV data, subjects, bodies, and recipient addresses must be redacted or omitted from routine logs.
- API errors shown to users must be useful but sanitized. Detailed diagnostics belong in restricted server logs and must still exclude secrets and full message bodies.
- Rate-limit OAuth initiation, test sends, imports, validation, and campaign sends per user and per IP where appropriate.
- Set conservative per-campaign and per-day limits for the initial release.
- Add abuse controls and clear acceptable-use language. The product must not facilitate unsolicited bulk email or attempts to bypass Gmail limits.
- Implement dependency scanning, secret scanning, structured audit events, database backups, and a documented token-revocation incident procedure.
- Apply least-privilege IAM and rotate client secrets and Supabase service credentials through a documented process.

## 13. Reliability and observability

- Send work must be idempotent and recoverable after worker restarts.
- Use structured logs with correlation IDs, user IDs or irreversible internal identifiers, campaign IDs, and recipient record IDs; do not log recipient content unnecessarily.
- Record metrics for OAuth success/failure, validation failures, queued messages, send latency, Gmail response categories, retries, successes, and permanent failures.
- Alert on elevated authorization failures, task backlog, send failure rate, and worker invocation failures.
- Use exponential backoff with jitter for retryable `429` and `5xx` responses while respecting Google guidance.
- Health checks must not expose environment variables, database credentials, token state, or stack traces.

## 14. Performance and limits

Initial limits should be configuration, not hard-coded product promises. Proposed starting values for validation during implementation:

- Maximum CSV size: 5 MB.
- Maximum recipients per campaign: 500.
- Maximum subject length: 998 characters technically, with a recommended UI limit of 200 characters.
- Maximum plain-text body size: 100 KB.
- Worker concurrency: low and bounded, tuned against Gmail quota behavior.
- Campaign status updates visible in the UI within 5 seconds under normal conditions.

These values must be confirmed against the intended users, Gmail quotas, Cloud Run request characteristics, and cost targets before launch.

## 15. Acceptance criteria for MVP

- A new user can sign in with Google through Supabase Auth.
- The user can connect Gmail through a Cloud Run-compatible OAuth web flow and the backend obtains offline authorization with `gmail.send`.
- Gmail refresh tokens never appear in frontend responses, browser storage, or logs and are encrypted in persistent storage.
- The user can upload a valid CSV, choose its email column, see validation results, and correct blocking errors.
- The user can compose subject/body templates, use CSV placeholders, and preview any row accurately.
- Missing placeholders, invalid addresses, empty files, oversized files, and duplicate recipients are handled according to the requirements before sending.
- The confirmation step displays the correct sender and final recipient count.
- A confirmed campaign continues sending if the browser closes.
- Repeating the send request or retrying a task does not resend a message already recorded as successful.
- The user can see durable progress and download a failure report.
- One user's API calls and database access cannot read or modify another user's Gmail connection, campaigns, or recipients.
- Disconnecting Gmail removes token material and prevents future sends until reconnection.
- No production deployment requires a local token file, checked-in secret, or service-account JSON key.

## 16. Migration and implementation phases

### Phase 1 — foundation

- Define Supabase schema, migrations, and RLS.
- Add Supabase Auth to the frontend.
- Create FastAPI service structure, JWT validation, configuration validation, and health checks.
- Configure Cloud Run service identity, Secret Manager, and KMS.

### Phase 2 — Gmail authorization

- Replace the desktop OAuth flow with the web authorization-code flow.
- Store encrypted per-user refresh tokens.
- Implement connect, connection status, reconnect, revoke, and test send.

### Phase 3 — campaign workflow

- Implement CSV validation/import, templates, preview, campaign confirmation, and immutable recipient snapshots.
- Build the simple frontend screens around these APIs.

### Phase 4 — durable sending

- Add Cloud Tasks, private worker authentication, retries, idempotency, progress, cancellation, and downloadable error reports.

### Phase 5 — hardening and launch

- Complete OAuth verification requirements, security review, rate limits, retention jobs, observability, alerts, runbooks, load tests, and end-to-end tests.
- Remove unused Firestore dependencies and retire Streamlit-specific configuration after the replacement is accepted.

## 17. Open product and technical decisions

These decisions do not block this PRD, but must be resolved before production implementation:

1. Is the first release restricted to internal/test Google users, one Workspace domain, or any consumer Gmail user? This affects OAuth consent and verification.
2. Should sign-in and Gmail authorization use two Google OAuth clients, as recommended, or one shared client?
3. What are the launch limits for recipients per campaign and sends per user per day?
4. What retention period applies to recipient data, rendered messages, and send history?
5. Should duplicate email addresses always block import, or may a user explicitly send multiple distinct rows to the same address?
6. Is campaign cancellation required for the first deploy or immediately after MVP?
7. Will the frontend be hosted separately as a static site or served by the FastAPI service?
8. Is Supabase Realtime desired for progress, or is short polling sufficient for the initial scale?
9. What privacy policy, acceptable-use policy, and user-support contact will be presented during Google OAuth verification?

## 18. Source-to-requirement traceability

- `app.py`: existing CSV template generation, upload, email-column selection, placeholder composition, preview, confirmation dialog, sequential send loop, progress, and error CSV.
- `src/gmail_auth.py`: current `gmail.send` scope, environment-variable/client-file alternatives, local desktop OAuth flow, token refresh, and local token persistence.
- `src/gmail_send.py`: current MIME construction and Gmail `users.messages.send` call.
- `.env.example`: current Google client and token-path configuration.
- `Dockerfile`: current Streamlit Cloud Run-style container command and insecure Streamlit protection overrides that must not migrate.
- `requirements.txt`: current Google, Streamlit, Secret Manager, and unused Firestore dependencies.
- `README.md`: current setup and secret-handling expectations.

