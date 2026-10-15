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

# 2. Configure local environment variables
cp .env.example .env.local

# 3. Install dependencies
npm install

# 4. Run database migrations & seed deterministic dev fixtures
npx prisma migrate dev
npx prisma db seed

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

### 4.1 Applying Migrations in Production
```bash
# Applies pending versioned migrations in prisma/migrations/ without resetting data or running dev seeds
npx prisma migrate deploy
```
- **Rule:** Never run `prisma migrate reset` or `prisma db push --force-reset` against staging or production databases.
- **Rule:** Never edit an already applied migration file. Create a new forward migration if a schema change is required.

### 4.2 Pre-Deployment Logical Backup (`pg_dump`)
Run a full compressed custom-format backup before any production schema migration:
```bash
pg_dump --format=custom --no-owner --no-acl \
  --dbname="$DATABASE_URL" \
  --file="gara_prod_backup_$(date -u +%Y%m%dT%H%M%SZ).dump"
```

### 4.3 Point-in-Time / Logical Restore (`pg_restore`)
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

### 5.3 Multi-Instance Distributed Rate Limiting (`src/lib/security/rate-limit.ts`)
- Uses `PostgresRateLimitStore` backed by the shared PostgreSQL `verifications` table (`identifier = 'RL:<scope>:<actor>'`) so rate limits are enforced consistently across multiple Node.js instances.
