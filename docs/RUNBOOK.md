# Operations, Deployment & Recovery Runbook — GARA Innovation Platform

> **Status:** Production Hardened (Prompt 10 Release Gate).
> **Audience:** Developers, DevOps engineers, and Platform Administrators.

---

## 1. Local Development & Verification Setup

### 1.1 Prerequisites
- **Node.js:** Supported Active LTS version (Node 20+ or Node 22+)
- **Package Manager:** `npm` (locked via `package-lock.json`)
- **Database:** PostgreSQL 15+

### 1.2 Initial Setup
```bash
# 1. Verify clean working tree
git status

# 2. Configure local environment variables in a single .env (gitignored).
#    Every variable is listed in section 2 below.

# 3. Install dependencies
npm install

# 4. Apply versioned migrations to the local database
npx prisma migrate dev

# 5. Start Next.js local development server
npm run dev
```

---

## 2. Environment Variables & Secret Hygiene (`src/lib/env.ts`)

| Variable | Required in Prod | Description |
|---|---|---|
| `NODE_ENV` | Yes | Set to `production` |
| `DATABASE_URL` | Yes | Managed PostgreSQL connection string (`sslmode=verify-full`) |
| `BETTER_AUTH_SECRET` | Yes | Cryptographic secret ($\ge 32$ chars; must NOT be `DEV_DEFAULT_AUTH_SECRET`) |
| `BETTER_AUTH_URL` | Yes | Canonical HTTPS origin (e.g. `https://portal.garainnovation.com`) |
| `GOOGLE_CLIENT_ID` | Yes (for OAuth) | Google OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | Yes (for OAuth) | Google OAuth 2.0 Client Secret |
| `SMTP_HOST` | Yes (OD-012) | Approved transactional SMTP host |
| `SMTP_PORT` | Yes (OD-012) | SMTP port (`587` STARTTLS or `465` TLS) |
| `SMTP_USER` | Yes (OD-012) | SMTP username |
| `SMTP_PASS` | Yes (OD-012) | SMTP password / API key |
| `SMTP_FROM` | Yes (OD-012) | Verified sender email address |
| `CRON_SECRET` | Yes | Bearer token required by `/api/jobs/run` (the automation endpoint called by schedulers and `npm run worker`), ≥ 16 chars |
| `DOCUMENT_STORAGE_MODE` | No | `link` (default): candidates share their resume as a Google Drive/OneDrive/Dropbox link. `local`: files are uploaded to the server's private disk (own server only, with `ALLOW_LOCAL_STORAGE_IN_PROD`) |
| `APP_TIMEZONE` | No | Business time zone for reminders and digests (default `Asia/Kolkata`) |
| `VIRUS_SCAN_MODE` | No | `off` (default) or `clamav`: every upload is streamed to clamd before it is stored; uploads are refused when clamd is unreachable (fail closed) |
| `CLAMAV_HOST` / `CLAMAV_PORT` | With `clamav` | clamd TCP address (default `127.0.0.1:3310`) |
| `PAYOUT_ENCRYPTION_KEY` | Production (to save bank details) | 32 random bytes, base64 (`openssl rand -base64 32`) or hex. Encrypts payout account numbers and PANs (AES-256-GCM). Keep it stable and backed up: a changed or lost key makes stored numbers unreadable. Without it, production refuses to save account numbers/PANs and `checkProductionReadiness` reports a blocker |
| `APP_URL` / `WORKER_INTERVAL_SECONDS` | Worker only | Base URL the worker calls and its polling interval (default 60 s) |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | No | Defaults to verifying the database TLS certificate. Set to `false` only as a documented, temporary exception |
| `NEXT_PUBLIC_WHATSAPP_URL` | No | Public `https://wa.me/<number>` contact link; hidden when unset |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | No | Present in `.env` but unused until a storage provider is approved (OD-013) |

**Fail-closed validation.** In production runtime (`NODE_ENV=production`, outside `next build`), the app refuses to start when any variable is invalid, when `BETTER_AUTH_SECRET` is the development fallback, or when a cloud deployment points `DATABASE_URL` at localhost. Development keeps valid values and only defaults the invalid keys, with a warning.

### 2.1 Secret Rotation Procedure
Rotate immediately if a secret may have been exposed (for example the removed `/api/debug-env` endpoint from commit `9be7b59`, which printed partial values):
1. Database: change the PostgreSQL role password at the provider, update `DATABASE_URL` in Vercel.
2. `BETTER_AUTH_SECRET`: generate `openssl rand -base64 48`, update Vercel. All signed session cookies become invalid; encrypted OAuth tokens can no longer be decrypted, so Google users simply sign in again.
3. `SMTP_PASS` (Gmail app password): revoke the old app password in the Google account, create a new one.
4. `GOOGLE_CLIENT_SECRET`, `CLOUDINARY_API_SECRET`: rotate in the provider consoles.
5. Redeploy, then clear remaining sessions once: `DELETE FROM sessions;`
6. Change any account password that ever appeared in source control or local notes (seeded admin / sub-admin accounts).

### 2.2 Seed Scripts (`scripts/`, not tracked in Git)
- Passwords are read only from `ADMIN_INITIAL_PASSWORD` / `RAGHAV_TEMP_PASSWORD` (≥ 12 chars with upper, lower, digit, symbol). There are no defaults.
- Scripts refuse non-local databases unless `--allow-remote` is passed. `seed-admin.mjs` never overwrites an existing password unless `--reset-password` is also passed, forces a password change at next sign-in, and never prints the password.

---

## 3. Quality Gate Pipeline (CI/CD Release Gate)

Every release candidate must pass all four automated checks with zero errors (the end-to-end suite in §3.1 is run before releases that touch user flows):

```bash
# 1. TypeScript Strict Mode Verification
npm run typecheck

# 2. ESLint Verification
npm run lint

# 3. Automated Unit, Security & Policy-Gate Suite (Vitest)
npm test

# 4. Production Build Verification
npm run build
```

### 3.1 End-to-End Tests (Playwright, `tests/e2e`)

```bash
npm run test:e2e:install   # once: downloads Chromium
npm run test:e2e           # public suite: no database needed
```

- The public suite starts the app with `DATABASE_URL` pointed at a closed local port, so it can never touch a real database. It covers public pages, the 375 px mobile layout, auth form validation and security headers.
- The journey suite (candidate → evaluation → intern, and candidate → offer → employee) runs only when `E2E_DATABASE_URL` points at a **dedicated test database**: the URL must differ from `DATABASE_URL` in `.env` and its database name must contain `test`. Global setup applies the migrations to that database and idempotently seeds deterministic fixtures (staff accounts and two published openings). Never point it at production.
- Optional: `E2E_SERVER_MODE=production` (run `npm run build` first) and `E2E_PORT`.
- Journeys pass the sign-in code step with `E2E_FIXED_OTP=<6 digits>`; it only takes effect against the dedicated test database outside production (see `docs/SECURITY.md`).

---

## 4. Database Migration, Backup & Restore Procedures

### 4.1 One-Time Migration Baseline (existing databases)

> **Neon:** run Prisma Migrate against the **direct** endpoint (host without `-pooler`); the pooled endpoint runs PgBouncer in transaction mode, which breaks Migrate's advisory locking. From the project root:
> ```bash
> export DATABASE_URL="$(node --env-file=.env -p 'const u=new URL(process.env.DATABASE_URL);u.host=u.host.replace("-pooler","");u.href')"
> ```
> `prisma7.config.ts` loads `.env` with dotenv, which does not override an already exported `DATABASE_URL`. Run `unset DATABASE_URL` afterwards.

The production database was created before versioned migrations existed. `prisma/migrations/20261024000000_baseline` reproduces that original schema exactly; mark it as already applied instead of running it:
```bash
# 0. Back up first (see 4.3)
# 1. Confirm the live schema matches the baseline: the diff from the live database to the
#    current schema must contain only the statements in 20261024000100_security_hardening
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
# 2. Record the baseline as applied without executing it
npx prisma migrate resolve --applied 20261024000000_baseline
# 3. Pre-check for duplicates that would block the new unique index on task submissions
#    SELECT "taskId", "versionNumber", COUNT(*) FROM task_submissions GROUP BY 1, 2 HAVING COUNT(*) > 1;
# 4. Apply the remaining migrations
npx prisma migrate deploy
```
Fresh databases skip step 2 and simply run `npx prisma migrate deploy`.

Later migrations (for example `20261025000000_candidate_lifecycle`) are applied with `npx prisma migrate deploy` against the direct endpoint, **before** deploying the code that uses them.

### 4.2 Applying Migrations in Production
```bash
# Applies pending versioned migrations in prisma/migrations/ without resetting data or running dev seeds
npx prisma migrate deploy
```
- **Rule:** Never run `prisma migrate reset` or `prisma db push --force-reset` against staging or production databases.
- **Rule:** Never edit an already applied migration file. Create a new forward migration if a schema change is required.

### 4.3 Pre-Deployment Logical Backup (`pg_dump`)
Run a full compressed custom-format backup before any production schema migration:
```bash
pg_dump --format=custom --no-owner --no-acl \
  --dbname="$DATABASE_URL" \
  --file="gara_prod_backup_$(date -u +%Y%m%dT%H%M%SZ).dump"
```

### 4.4 Point-in-Time / Logical Restore (`pg_restore`)
To restore into a clean recovery database instance and verify integrity:
```bash
# 1. Restore schema and data into recovery database
pg_restore --clean --if-exists --no-owner --no-acl \
  --dbname="$RECOVERY_DATABASE_URL" \
  gara_prod_backup_YYYYMMDDTHHMMSSZ.dump

# 2. Verify Prisma migration table state
DATABASE_URL="$RECOVERY_DATABASE_URL" npx prisma migrate status
```

---

## 5. Health Check & Operational Monitoring

### 5.1 Health Endpoint (`GET /api/health`)
- Returns HTTP `200` (`status: "ok"`) when PostgreSQL is reachable (`SELECT 1`), or HTTP `503` (`status: "degraded"`) if the database is unreachable.
- Reports `productionCredentialsReady` and the active `policyGatesEnforced` list (`OD-001` through `OD-013`) without exposing secrets.

### 5.2 Durable Notification Outbox (`src/infrastructure/email/outbox-processor.ts`)
- Transactional workflows write outbound email events to `notification_outbox` (`status = 'PENDING'`).
- `OutboxProcessorService.processPendingBatch()` processes pending/failed records up to `maxAttempts = 5` and skips any record where `status = 'SENT'` or `sentAt IS NOT NULL` to guarantee idempotent delivery.
- Rows are claimed with a conditional update (`status` + `attempts` must still match), so concurrent workers never double-send. Exhausted rows move to `DEAD_LETTER`; `PROCESSING` rows whose `claimedAt` is older than 10 minutes are recovered.
- Delivery triggers: Server Actions call `scheduleOutboxFlush()` (Next.js `after()`) right after enqueueing; every automation run (see §5.5) also delivers queued email.
- Inspect stuck mail: `SELECT id, "templateName", status, attempts, "lastError" FROM notification_outbox WHERE status IN ('FAILED','DEAD_LETTER') ORDER BY "createdAt" DESC;` Reset a dead-letter row for one more round with `UPDATE notification_outbox SET status='FAILED', attempts="maxAttempts"-1 WHERE id='<id>';`

### 5.3 Multi-Instance Distributed Rate Limiting (`src/lib/security/rate-limit.ts`)
- Uses `PostgresRateLimitStore` backed by the shared PostgreSQL `verifications` table (`identifier = 'RL:<scope>:<actor>'`) so rate limits are enforced consistently across multiple Node.js instances. Each check runs in a transaction holding `pg_advisory_xact_lock(hashtext(key))`, so concurrent requests cannot all slip past the limit.
- Better Auth endpoints (sign-in, sign-up, password reset) use Better Auth's own limiter with `storage: "database"` (`rate_limits` table), shared across serverless instances.
- Client IPs come from `x-real-ip` / `x-forwarded-for` (`src/lib/security/client-ip.ts`). This assumes the edge (Vercel) overwrites those headers; behind another proxy, configure it to do the same. Only keyed hashes of IPs are stored.

### 5.3a Sign-in Codes (email OTP)
- Every password sign-in and every new email/password account needs a 6-digit code emailed through SMTP (see `docs/SECURITY.md` §2 "Email One-Time Codes"). **If SMTP fails, nobody can sign in with a password**, administrators included: monitor delivery and keep SMTP credentials current. Google sign-in keeps working for accounts linked to Google.
- A person who did not receive a code can press "Resend code" after 60 seconds; codes expire after 10 minutes. After 10 wrong codes the second step is locked for 15 minutes.
- Unlock a locked account early: `UPDATE two_factors SET "failedVerificationCount" = 0, "lockedUntil" = NULL WHERE "userId" = '<user id>';`
- Accounts that existed before 2026-10-26 without a verified email are asked to verify on their next sign-in.

### 5.4 Password Reset
- `/forgot-password` calls Better Auth `requestPasswordReset`; the response is identical for known and unknown emails and the email is sent after the response.
- The emailed link is single-use and valid for 1 hour. It lands on `/reset-password`; completing it revokes every session of that user and clears `mustChangePassword`.
- Administrators issue temporary passwords only when creating sub-admins; those accounts are forced through `/set-password`, and every server boundary rejects such sessions until then.

### 5.5 Automation (reminders, digests, scheduled conversions)
The app runs its own durable job system (`scheduled_jobs` table, `src/infrastructure/jobs`, handlers in `src/features/automation`). Jobs are queued at the exact time they are due (e.g. interview reminders 24 h and 1 h before), and email is sent through the configured SMTP account. Nothing depends on Vercel Cron.

A run is triggered by any of:
1. **App traffic** — signed-in page views schedule a run after the response, at most once a minute per server instance.
2. **`/api/jobs/run`** — `POST` (or `GET`) with `Authorization: Bearer <CRON_SECRET>`. Point any scheduler at it while the app runs on serverless hosting, for example a free external cron service every 5 minutes, or a crontab line on any machine:
   `*/5 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/jobs/run > /dev/null`
3. **`npm run worker`** — on a long-running server (PM2/systemd/container) it calls the endpoint every minute (`APP_URL`, `CRON_SECRET`, optional `WORKER_INTERVAL_SECONDS`). This is the recommended setup once the organisation has its own server.

Runs are safe to overlap: each job is claimed with a conditional update, failed jobs retry with backoff (1, 4, 9, 16 minutes) up to 5 attempts, and jobs stuck in `RUNNING` for 10 minutes are recovered. Reminder precision equals the trigger interval.

Inspect: `SELECT type, status, "runAt", attempts, "lastError" FROM scheduled_jobs WHERE status IN ('PENDING','FAILED') ORDER BY "runAt";`

Automated emails are idempotent: each outbox row carries a unique `dedupeKey` (one per recipient and occurrence) inserted with `ON CONFLICT DO NOTHING`, so retries and overlapping runs never send twice. Daily jobs that start after their business day are skipped instead of sending stale reminders.

### 5.6 Interview Invitations and Self-Scheduling
- Interview invitation, reschedule and cancellation emails carry an iCalendar invite (`text/calendar`, `src/infrastructure/email/ics.ts`). Each interview keeps a stable `UID`; `interview_schedules."icsSequence"` increases on every reschedule and on cancel, so calendar apps update or remove the existing event instead of adding a new one. Only https meeting links are written into the invite.
- Staff can offer time slots instead of fixing a time ("Let the candidate choose a time" on the application page). The candidate books one slot at `/candidate/interviews/<requestId>`; booking creates the interview, releases the other slots and sends the invite. Templates: `INTERVIEW_BOOKING_REQUEST`, `INTERVIEW_BOOKING_CANCELLED`.
- Inspect open requests: `SELECT id, "applicationId", "roundNumber", status, "createdAt" FROM interview_booking_requests WHERE status = 'PENDING' ORDER BY "createdAt";`

### 5.7 Offer Letters and Electronic Acceptance
- `GET /api/offers/<id>/letter` streams the offer letter PDF (no caching, `Content-Disposition: attachment`). Access: the candidate who owns the offer, or HR/Admin with `canEmployees`.
- The letter is generated deterministically from the offer record, so the same offer always produces the same bytes. To accept, the candidate types their full name and confirms consent; the server regenerates the letter, checks that its SHA-256 still matches the hash the candidate was shown, and stores the evidence in the same conditional update that accepts the offer (see `docs/SECURITY.md` §E-signature evidence). The `OFFER_ACCEPTED_CONFIRMATION` email follows.
- If staff edit the offer or `APP_TIMEZONE` changes, the regenerated letter no longer matches the accepted hash and the staff card shows that it differs; the stored hash remains the record of what was accepted.

### 5.8 Application Sources, Funnel Analytics and Search Engines
- Share opening links with a source: `https://<domain>/careers/<slug>?source=linkedin` or standard `utm_source` / `utm_medium` / `utm_campaign`. The parameters survive sign-in and are normalised on the server (`src/features/applications/source-tracking.ts`); the candidate's own "How did you hear about us?" answer wins.
- Reports → **Funnel** (`?tab=funnel`) shows stage conversion, drop-off, time in stage, time to hire and sources, filterable by date range, opening type and opening, with a CSV export (audited as `EXPORT_REPORT`).
- Bulk actions on the application lists move or reject up to 100 selected applications (ADMIN/HR with `canApplications`); every item goes through the single stage-transition checks and the result lists moved and skipped applications with reasons.
- `/sitemap.xml` lists published openings and `/robots.txt` blocks portals, auth screens, APIs and apply forms. Opening pages embed `JobPosting` structured data for Google Jobs. Both use `BETTER_AUTH_URL` as the public origin, so set it to the production domain. After launch, submit the sitemap in Google Search Console and check an opening with the Rich Results Test.

### 5.9 Own Storage Server: Private Uploads with Virus Scanning
Until the organisation runs its own server, keep `DOCUMENT_STORAGE_MODE=link`. To switch to uploads on a long-running server:
1. Install clamd: `sudo apt install clamav-daemon clamav-freshclam`, then in `/etc/clamav/clamd.conf` set `TCPSocket 3310`, `TCPAddr 127.0.0.1` and `StreamMaxLength 12M` (at least the 10 MB storage limit). Start `clamav-freshclam` and `clamav-daemon` and confirm with `echo PING | nc 127.0.0.1 3310` (expects `PONG`).
2. Set `DOCUMENT_STORAGE_MODE=local`, `VIRUS_SCAN_MODE=clamav`, `CLAMAV_HOST` / `CLAMAV_PORT` and `ALLOW_LOCAL_STORAGE_IN_PROD=true`. `checkProductionReadiness` reports a blocker when uploads are enabled with scanning off.
3. Put `.storage/private` on a persistent disk owned by the app user with `chmod 700`, outside any web root, and include it in nightly encrypted backups.
- Every upload is checked against its declared type by file signature (PDF, JPEG, PNG) and streamed to clamd before it is written. Infected files are rejected; when clamd is unreachable uploads fail closed (`VirusScanUnavailableError`, an operational 503) and the user sees a friendly "try again later" message.
- Files are served only through the authenticated route `/api/candidate/applications/<id>/resume`, which authorizes the candidate who owns the application and permitted staff; nothing is stored in `public/`.

---

## 6. Performance Notes

### 6.1 Keep compute next to the database
- Neon runs in `ap-southeast-1` (Singapore). `vercel.json` pins Vercel Functions to `sin1` (Singapore) so each query is a same-region round trip. Before this, functions ran in `iad1` (Washington) and every query crossed the globe (~0.77 s for a single `SELECT 1`), which made sign-in and dashboards take several seconds.
- If the database ever moves, update `"regions"` in `vercel.json` to the matching Vercel region. Verify with the `x-vercel-id` response header (`<edge>::<function-region>::<id>`).
- Neon's free plan suspends idle compute; the first request after a pause pays a cold start of roughly a second. Disable scale-to-zero in the Neon console if that matters.

### 6.2 Request-level deduplication
- `getCurrentUser()` and `getUserPermissions()` are memoized per request with React `cache()`, so a layout, its page and the services they call share one session lookup and one permission read.

### 6.3 Loading experience
- Portal layouts render the auth-dependent shell inside `<Suspense>` with `DashboardShellSkeleton`, so the prerendered static shell paints immediately and the session streams in.
- Every dashboard route has a `loading.tsx` that mirrors its layout (`src/components/feedback/page-skeletons.tsx`); public and auth routes have matching skeletons. Skeleton blocks pulse only when the user allows motion (`motion-safe`) and each region announces its loading state to screen readers.
- After sign-in the client navigates once, straight to the user's portal (`getHomePathForUser`), instead of bouncing through `/dashboard`.
- Public and auth routes (`/careers`, `/careers/<slug>`, `/help`, `/verify`, sign-in screens) have their own `loading.tsx`; a thin top progress bar (`src/components/navigation/navigation-progress.tsx`) appears when a navigation takes longer than 120 ms.

### 6.4 Bounded queries and pagination (2026-10-26)
- Every staff list loads one page from the database (`skip`/`take`, at most 50 rows, total from a `count` in the same `Promise.all`); filters, page, month and tab travel in the URL. This covers the application queue, interview board (default window: 30 days back to 60 days ahead, `?range=all` for everything), employee directory, evaluation list, intern review board, intern tasks, leave, attendance (one business month at a time), payroll and sub-admins.
- Reports and the admin overview aggregate in PostgreSQL (`groupBy`, `count`, `aggregate`, parameterised `$queryRaw`); no report loads whole tables. CSV exports stop at 10,000 rows and say so.
- Heavy dialogs (leave, attendance, payroll, sub-admin, evaluation, intern-task and review dialogs) and the report charts are loaded on demand (`next/dynamic` / `React.lazy`), so the first page load ships less JavaScript.
- Migration `20261028000000_performance_indexes` adds the composite indexes these queries use (applied to Neon on 2026-10-26).

### 6.5 Caching of public data
- `getPublicOpenings`, `getPublicOpeningBySlug` and the sitemap slug list use `"use cache"` (`src/features/openings/services/opening-service.ts`): refreshed in the background every 5 minutes, served stale for at most a day, tags `openings:public`, `opening:slug:<slug>`, `opening:id:<id>`.
- Opening Server Actions (create, status change, form publish) call `updateTag` for those tags, so staff changes are visible on the next request. A future action that edits an opening must call `revalidateOpeningCaches` too.
- Nothing private is cached: apply pages, portals and certificate verification (`/verify`, revocation must apply immediately) always read the database.
- On Vercel the default cache store is per instance. If the hit rate is low, switch the three functions to `"use cache: remote"`.
