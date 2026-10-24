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
| `CRON_SECRET` | Yes | Bearer token Vercel Cron sends to `/api/cron/outbox` (≥ 16 chars) |
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

Every release candidate must pass all four automated checks with zero errors:

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
- Delivery triggers: Server Actions call `scheduleOutboxFlush()` (Next.js `after()`) right after enqueueing, and Vercel Cron calls `GET /api/cron/outbox` (configured in `vercel.json`, authorized by `CRON_SECRET`). The Hobby plan only allows daily cron schedules; upgrade the plan before shortening the schedule.
- Inspect stuck mail: `SELECT id, "templateName", status, attempts, "lastError" FROM notification_outbox WHERE status IN ('FAILED','DEAD_LETTER') ORDER BY "createdAt" DESC;` Reset a dead-letter row for one more round with `UPDATE notification_outbox SET status='FAILED', attempts="maxAttempts"-1 WHERE id='<id>';`

### 5.3 Multi-Instance Distributed Rate Limiting (`src/lib/security/rate-limit.ts`)
- Uses `PostgresRateLimitStore` backed by the shared PostgreSQL `verifications` table (`identifier = 'RL:<scope>:<actor>'`) so rate limits are enforced consistently across multiple Node.js instances. Each check runs in a transaction holding `pg_advisory_xact_lock(hashtext(key))`, so concurrent requests cannot all slip past the limit.
- Better Auth endpoints (sign-in, sign-up, password reset) use Better Auth's own limiter with `storage: "database"` (`rate_limits` table), shared across serverless instances.
- Client IPs come from `x-real-ip` / `x-forwarded-for` (`src/lib/security/client-ip.ts`). This assumes the edge (Vercel) overwrites those headers; behind another proxy, configure it to do the same. Only keyed hashes of IPs are stored.

### 5.4 Password Reset
- `/forgot-password` calls Better Auth `requestPasswordReset`; the response is identical for known and unknown emails and the email is sent after the response.
- The emailed link is single-use and valid for 1 hour. It lands on `/reset-password`; completing it revokes every session of that user and clears `mustChangePassword`.
- Administrators issue temporary passwords only when creating sub-admins; those accounts are forced through `/set-password`, and every server boundary rejects such sessions until then.

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
