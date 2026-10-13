# Running and operating the system

## What runs

| Part | What it is | Notes |
| --- | --- | --- |
| API | Node 22, NestJS, one container (`apps/api/Dockerfile`) | Stateless. Sessions, one-time codes and the outbox live in Postgres. |
| Database | PostgreSQL 16 | The only source of truth. Back it up. |
| Document store | S3-compatible bucket (MinIO in `docker-compose.yml`, or AWS S3, R2, Wasabi, …) or a local directory | Private. Files are streamed through the API after a permission check; there are no public or presigned links. |
| Web app | Next.js (`apps/web`) | Proxies `/api/*` to the API. |

Nothing is tied to one cloud: the only contracts are a Postgres connection string and an S3 endpoint.

## First run on a laptop

```bash
cp .env.example .env            # then set APP_ENCRYPTION_KEY:  openssl rand -base64 32
pnpm install
pnpm db:up                      # Postgres and MinIO
pnpm db:migrate
pnpm db:seed                    # sample temple, people and applications (development only)
pnpm dev
```

With `DELIVERY_MODE=console` one-time sign-in codes are printed in the API log instead of being sent.

## First run for a real temple

```bash
node dist/cli/provision.js --name "ISKCON Newtown" --admin-name "Full Name" --admin-email admin@example.org
# from a checkout:  pnpm -F @iskcon/api provision -- --name ... --admin-name ... --admin-email ...
```

This creates the temple (slug `DEFAULT_TENANT_SLUG`), its first administrator and the baseline rule set at the
GBC minimums. It is safe to run twice. The administrator signs in with an emailed code and enrols an
authenticator app (required for the president and administrator roles). Never run `seed` against a real database.

## Configuration

All settings are environment variables, validated at start-up (`apps/api/src/config/env.ts`); a bad value stops the
process with a readable message.

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | required | Postgres connection string. |
| `DATABASE_POOL_MAX` | 10 | Pool size. |
| `RUN_MIGRATIONS_ON_BOOT` | false | Apply pending migrations at start. Fine for one instance; for several, run the migrate job once before rolling out. |
| `APP_ENCRYPTION_KEY` | required | 32 random bytes, base64. Seals authenticator secrets and keys the one-time-code hashes. Changing it signs everyone out and forces authenticator re-enrolment. |
| `DEFAULT_TENANT_SLUG` | newtown | The single active temple (see ADR-0003). |
| `PUBLIC_WEB_URL`, `CORS_ORIGIN` | localhost:3000 | Where the web app is served. |
| `COOKIE_SECURE`, `COOKIE_DOMAIN` | false | Set `COOKIE_SECURE=true` behind HTTPS (always, in production). |
| `SESSION_TTL_HOURS` | 12 | Session lifetime. |
| `OTP_TTL_MINUTES`, `OTP_MAX_ATTEMPTS`, `OTP_MAX_PER_HOUR` | 10, 5, 5 | One-time-code limits. |
| `DELIVERY_MODE` | console | `live` sends real mail and SMS. |
| `SMTP_URL`, `MAIL_FROM` | | Outgoing mail. |
| `SMS_WEBHOOK_URL`, `SMS_WEBHOOK_TOKEN` | | Optional SMS gateway (POST JSON `{to, text}`). Empty disables SMS. |
| `STORAGE_DRIVER` | local | `local` or `s3`. Use `s3` for anything real. |
| `STORAGE_LOCAL_DIR` | ./storage | Directory for the local driver. |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | | Bucket settings. `S3_ENDPOINT` + `S3_FORCE_PATH_STYLE=true` for MinIO and most non-AWS stores. Leave the keys empty on AWS to use the instance role. |
| `S3_SSE` | AES256 on AWS, none with `S3_ENDPOINT` | Server-side encryption header: `AES256`, `aws:kms` or `none`. |
| `MAX_UPLOAD_MB` | 10 | Largest accepted document (1–50). |
| `OUTBOX_ENABLED`, `OUTBOX_POLL_MS` | true, 1000 | Event dispatch. |
| `SCHEDULER_ENABLED` | true | Daily reminders and notification delivery. Set false on all but one instance if you scale out. |
| `LOG_LEVEL`, `PORT`, `NODE_ENV` | info, 4000, development | |

## Docker

```bash
docker compose up -d postgres minio          # backing services only
docker compose --profile app up --build      # also the API container, wired to both
docker build -f apps/api/Dockerfile -t iskcon-api .     # build context is the repository root
docker run --rm --env-file .env iskcon-api node dist/database/migrate.js   # migrations as a job
```

The image runs as a non-root user, contains compiled code and production dependencies only, and has a health
check on `/healthz`. `/readyz` also checks the database; use it for load-balancer readiness.

## Migrations

SQL files in `apps/api/drizzle/`, generated from the schema (`pnpm -F @iskcon/api db:generate`) and **reviewed and
committed with the change that needs them**. They only move forward; a mistake is fixed by a new migration. Take a
backup before a release that includes one.

## Background work

* **Outbox dispatcher** (every `OUTBOX_POLL_MS`): delivers domain events written in the same transaction as the change.
  Handlers are retried and must be idempotent.
* **Notification delivery** (every few seconds): sends pending mail and SMS, with retry.
* **Daily reminders** (09:00 Asia/Kolkata): a monthly-note reminder to each mentor with overdue candidates, and a digest of files waiting for review, for every temple.

All three run inside the API process. With more than one API instance, run the scheduler on one of them only
(`SCHEDULER_ENABLED=false` on the rest); the outbox and notification claims use `FOR UPDATE SKIP LOCKED` and are safe to run everywhere.

## Backups and recovery

* **Postgres**: nightly `pg_dump` plus WAL archiving or your provider's point-in-time recovery. A restore test every
  quarter is worth more than the backup itself.
* **Documents**: turn on bucket versioning and keep a copy in a second bucket or region. The database holds only
  object keys; the audit log records every upload and removal. Removals are soft deletes.
* **`APP_ENCRYPTION_KEY`**: store it in your secret manager, separately from the database backups.

## Security checklist for go-live

* HTTPS in front of both services; `COOKIE_SECURE=true`.
* Strong, unique `APP_ENCRYPTION_KEY`, database password and bucket credentials. Bucket is private.
* `DELIVERY_MODE=live` with working mail (and SMS, if used); send yourself a code first.
* Administrator and president have enrolled their authenticator app.
* `pnpm audit --prod` is clean (CI runs it) and the database is not exposed to the internet.
* Known gap: uploads are checked by content type and size, not scanned for malware (see `docs/backlog.md`).

## Health, logs, and common problems

Logs are JSON (pino), one line per request with a request id that is also returned in the `x-request-id` header
and in every problem response, so a user's error can be found. Cookies and authorization headers are redacted from the logs.

| Symptom | Likely cause |
| --- | --- |
| API exits at start with `Invalid environment` | A required variable is missing or malformed; the message names it. |
| Everyone suddenly signed out and authenticators rejected | `APP_ENCRYPTION_KEY` changed. |
| Codes never arrive | `DELIVERY_MODE` still `console`, or `SMTP_URL` wrong; see the notifications table for failures. |
| Uploads fail with 5xx | Bucket missing or credentials wrong; with MinIO behind a proxy check `S3_FORCE_PATH_STYLE`. |
| `403 CSRF` on every write | The web proxy is not forwarding the `X-Requested-By` header or the cookie. |
