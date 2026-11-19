# GARA Innovation — Recruitment, Internship Lifecycle & HRMS Platform

Enterprise full-stack recruitment, internship evaluation, and human resource management platform for GARA Innovation.

---

## Technical Stack

- **Framework:** [Next.js 16.4.3 (App Router)](https://nextjs.org/) + React 19.3
- **Architecture:** Modular Monolith under `src/` with isolated domain feature modules
- **Database:** PostgreSQL + [Prisma ORM 7](https://www.prisma.io/) with `@prisma/adapter-pg`
- **Authentication:** [Better Auth](https://www.better-auth.com/) (Email/Password + Google OAuth; emailed one-time code on every password sign-in)
- **Styling:** Tailwind CSS v4 + GARA Design Tokens (restrained palette, zero gradients)
- **Icons:** [Lucide React](https://lucide.dev/)
- **Validation:** [Zod](https://zod.dev/) + React Hook Form
- **Testing:** [Vitest](https://vitest.dev/) unit tests with mocked persistence in `tests/unit/` and [Playwright](https://playwright.dev/) end-to-end tests in `tests/e2e/` (a public suite that needs no database, and two hiring journeys that run only against a dedicated test database). Both are committed. There is no database-backed integration suite yet (see `docs/SECURITY_REMEDIATION_CHECKLIST.md`, ENG-07). Details: `docs/TESTING.md`.
- **CI:** `.github/workflows/ci.yml` runs typecheck, lint, unit tests and the production build on every push to `main` and every pull request (no secrets, no database). The Playwright suites run locally.

---

## Quick Start for Local Development

### 1. Prerequisites
- **Node.js:** v20+ or v24+
- **PostgreSQL:** Running local instance or hosted database

### 2. Configure Environment
```bash
# Create a single .env in the project root (never commit it).
# Every variable is listed in docs/RUNBOOK.md section 2.
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Database Setup & Prisma Client
```bash
# Generate Prisma Client
npx prisma generate

# Apply versioned migrations (when PostgreSQL is connected)
npx prisma migrate dev
# Existing databases created before migrations existed: follow the baseline procedure in docs/RUNBOOK.md §4.1
```

### 5. Start Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Quality Gate Commands

Run all checks locally before submitting changes:

```bash
# TypeScript typecheck
npm run typecheck

# Linting
npm run lint

# Unit tests (Vitest)
npm test

# Production build
npm run build

# End-to-end tests (Playwright; journeys need E2E_DATABASE_URL, see docs/TESTING.md)
npm run test:e2e:install   # once: downloads Chromium
npm run test:e2e
```

CI runs the first four on every push to `main` and every pull request.

---

## Documentation Suite

| Document | Purpose |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Persistent rules and non-negotiable guidelines for AI assistants |
| [`docs/PROJECT_BASELINE.md`](docs/PROJECT_BASELINE.md) | Product source of truth and master phased prompt pack |
| [`docs/PROJECT_RULES.md`](docs/PROJECT_RULES.md) | Engineering standards and developer rules (Sections A–K) |
| [`docs/FOLDER_STRUCTURE.md`](docs/FOLDER_STRUCTURE.md) | Repository layout, route map, and dependency rules |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System layers, domain boundaries, and provider adapters |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Relational database schema outline and state machines |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Security policy, RBAC hierarchy, and document privacy |
| [`docs/TESTING.md`](docs/TESTING.md) | Test suites (unit, E2E), test database setup, and quality gates |
| [`docs/OPEN_DECISIONS.md`](docs/OPEN_DECISIONS.md) | Active policy questions and unresolved blockers (OD-001–OD-020) |
| [`docs/RUNBOOK.md`](docs/RUNBOOK.md) | Deployment runbook, secret hygiene, and incident handling |
| [`docs/SECURITY_REMEDIATION_CHECKLIST.md`](docs/SECURITY_REMEDIATION_CHECKLIST.md) | Audit findings, fix status, and required owner actions |
