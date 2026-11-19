# Testing Strategy — GARA Innovation Platform

> **Status:** Test strategy and current suites. Vitest unit tests (`tests/unit`) and Playwright end-to-end tests (`tests/e2e`) are committed. CI (`.github/workflows/ci.yml`) runs the unit tests; the end-to-end suites run locally (`docs/RUNBOOK.md` §3.1). There is no integration suite yet.

---

## 1. Test Layers

### Unit Tests (`tests/unit/`)

**Purpose:** Test individual functions, services, and utilities in isolation.

**What to test:**
- Business logic in `src/features/*/services/`
- Server Actions and their authorization checks (`src/features/*/actions.ts`)
- Validation schemas (`src/features/*/schemas.ts`)
- Utility functions (`src/lib/`)
- Error handling and edge cases
- State transition validation logic
- Data transformation functions

**Characteristics:**
- No real database and no external services: files that need persistence replace the Prisma client with `vi.mock("@/lib/db")`
- A few tests use a temporary directory or a local fake socket (storage and virus-scan tests)
- Fast execution (< 1 second per test)
- High coverage of business rules

**Framework:** Vitest (`vitest.config.ts`: jsdom environment, globals, `@` → `src`). Component tests use `@testing-library/react`. Files are `*.test.ts` / `*.test.tsx`; Vitest never collects the `*.e2e.ts` Playwright specs.

### Integration Tests (not set up)

There is no `tests/integration/` directory. Database-level behaviour (constraints, locks, conditional updates) is exercised only by the E2E journeys, which run against a real PostgreSQL test database. A dedicated integration suite remains open (`docs/SECURITY_REMEDIATION_CHECKLIST.md`, ENG-07).

**What it should cover once added:**
- Server Actions with real database operations
- Route Handlers with authentication/authorization
- Database constraints and unique violations
- State transitions end-to-end (e.g., application pipeline)
- Role-based access control (permitted + forbidden)
- Record-level ownership enforcement

**Characteristics (target):**
- Use a dedicated test database (same schema, separate instance), guarded like the E2E database
- Run migrations before the suite
- Each test gets a clean state (transaction rollback or truncation)

### End-to-End Tests (`tests/e2e/`)

**Purpose:** Test critical user journeys in a real browser at realistic viewports.

**Public suite (`tests/e2e/public/`, no database):**
- Home, careers, login, reset-password (invalid link) and registration form validation (nothing is submitted)
- Protected routes send anonymous visitors to `/login` with a `callbackUrl`
- Security headers and the production CSP; `/api/jobs/run` rejects calls without the secret
- Help centre, certificate verification form and an unknown code, `robots.txt`, `sitemap.xml`, client-side navigation
- No horizontal overflow at 375 px

**Journey suite (`tests/e2e/journeys/`, dedicated test database):**
- Internship: candidate applies, HR runs the pipeline and the evaluation, the intern joins
- Full-time: candidate applies, HR extends an offer, the candidate accepts, HR marks the employee as joined

**Characteristics:**
- Playwright starts the app itself (`next dev` by default, `next start` with `E2E_SERVER_MODE=production`)
- Projects: `chromium` (Desktop Chrome, 1280 × 720) and `mobile-375` (375 × 667 touch profile); the journeys run on desktop only
- Not run in CI; run locally before releases that touch user flows

**Framework:** Playwright (adopted 2026-10-25; `playwright.config.ts`, specs `tests/e2e/**/*.e2e.ts`, usage in `docs/RUNBOOK.md` §3.1).

### How the Journeys Run Against a Test Database

1. Start a throwaway PostgreSQL database whose host or database name contains `test`, for example a local PGlite socket server or a Neon test branch (e.g. database `e2e_test`).
2. Run `E2E_DATABASE_URL=<that URL> npm run test:e2e`. Without `E2E_DATABASE_URL` every journey is skipped.
3. `tests/e2e/support/database-guard.ts` refuses the URL if it equals or points at the same host, port and database as `DATABASE_URL` (in `.env` or the environment), or if neither host nor database name contains `test`. The check runs in `playwright.config.ts` and again in global setup.
4. `tests/e2e/global-setup.ts` runs `prisma migrate deploy` against that database and seeds the deterministic fixtures (`tests/e2e/support/seed.ts`, idempotent upserts).
5. The app server is started with `DATABASE_URL` set to the test database and `E2E_FIXED_OTP` set to the fixed test code from `tests/e2e/support/fixtures.ts`, so the journeys can pass the emailed sign-in code step. The server honours that code only outside production (`NODE_ENV` not `production`, not on Vercel) and only while connected to the same dedicated test database (`resolveFixedTestOtp` in `src/lib/auth/auth.ts`).
6. Journeys run one at a time (one worker) against the shared test database.

---

## 2. Test Directory Structure

```
tests/
├── unit/                          # Vitest, flat folder of files grouped by domain
│   ├── applications.test.ts
│   ├── recruitment.test.ts
│   ├── security-core.test.ts
│   ├── navbar-and-auth-redirect.test.tsx
│   ├── ...                        # *.test.ts / *.test.tsx
│   └── helpers/                   # Shared mock adapters (e.g. session-access.ts for the session query)
│
└── e2e/                           # Playwright
    ├── global-setup.ts            # Guard, migrate and seed the dedicated test database
    ├── public/                    # No database
    │   ├── public-pages.e2e.ts
    │   ├── security.e2e.ts
    │   ├── site-files-and-help.e2e.ts
    │   └── mobile-layout.e2e.ts
    ├── journeys/                  # Dedicated test database
    │   ├── internship-journey.e2e.ts
    │   └── full-time-journey.e2e.ts
    └── support/
        ├── database-guard.ts      # Refuses anything that could be a real database
        ├── env.ts                 # Skip conditions (no test database, production server)
        ├── fixtures.ts            # Fixed test users, openings, OTP and passwords
        ├── seed.ts                # Writes the fixtures to the test database
        ├── auth-ui.ts             # Sign-in helpers
        └── journey-ui.ts          # Shared journey steps
```

Run output goes to `tests/.e2e-results/` (and the HTML report on CI-mode runs to `tests/.e2e-report/`); both are gitignored.

---

## 3. Critical Test Journeys

### Must-Have Test Coverage

The "Test Type" column is the target. Until an integration suite exists, the Integration rows are covered by unit tests with mocked persistence and, where a journey passes through them, by the E2E journeys.

| Journey | Test Type | Priority |
|---|---|---|
| User registration (email/password) | Integration + E2E | P0 |
| User login / logout | Integration + E2E | P0 |
| Google OAuth flow | Integration (mock) + E2E (if possible) | P0 |
| Password reset flow | Integration | P0 |
| Candidate submits application | Integration + E2E | P0 |
| Application status transitions | Unit + Integration | P0 |
| HR reviews application | Integration + E2E | P1 |
| Interview scheduling | Integration | P1 |
| Interview feedback submission | Integration | P1 |
| Intern task assignment & completion | Integration | P1 |
| Certificate generation & verification | Integration + E2E | P1 |
| Role-based dashboard rendering | E2E | P1 |
| Public certificate verification | Integration + E2E | P1 |

### Negative/Security Tests (Required)

| Scenario | Test Type |
|---|---|
| Unauthorized access to another candidate's application | Integration |
| Candidate trying to access HR dashboard | Integration |
| Employee accessing another employee's payslip | Integration |
| Invalid application status transition | Unit + Integration |
| Malformed input to Server Actions | Unit + Integration |
| SQL injection attempts (Prisma parameterization) | Integration |
| XSS payload in form fields | Integration |
| Duplicate form submission | Integration |
| File upload with disallowed MIME type | Integration |
| File upload exceeding size limit | Integration |
| Expired/invalid session access | Integration |
| Rate limit enforcement on login | Integration |
| Certificate verification with invalid code | Integration |
| Cross-user record access via ID manipulation | Integration |
| Role escalation via API manipulation | Integration |

---

## 4. Quality Gate Commands

CI (`.github/workflows/ci.yml`) runs steps 1–4 on every push to `main` and every pull request, with an unreachable placeholder `DATABASE_URL` and no secrets.

```bash
# 1. TypeScript type check
npm run typecheck

# 2. Lint
npm run lint

# 3. Unit tests (Vitest)
npm test

# 4. Production build
npm run build

# 5. E2E tests (local; journeys need E2E_DATABASE_URL, see §1)
npm run test:e2e:install   # once: downloads Chromium
npm run test:e2e

# 6. Migration check against a migrated test database (exit code 0 = in sync, 2 = drift)
DATABASE_URL=<test database URL> npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

> No formatter check is configured (there is no Prettier in the project).

---

## 5. Phase Acceptance Rules

### Before Any Phase Is "Complete"

1. **All existing tests pass.** No regressions.
2. **New business logic has unit tests.** Services and validators tested.
3. **New server boundaries have authorization tests.** Both permitted and forbidden.
4. **Lint and typecheck pass with zero errors.**
5. **Production build succeeds.**
6. **No `@ts-ignore`, `any` casts, or disabled lint rules** without documented justification.

### Before Feature Is "Production-Ready"

1. All above, plus:
2. **Integration tests for the feature's critical paths.**
3. **E2E tests for the feature's primary user journey.**
4. **Tested at mobile, tablet, and desktop viewports.**
5. **Keyboard navigation and basic accessibility verified.**
6. **Error states, loading states, and empty states exist and are tested.**
7. **No fake data displayed as real in any production-like context.**

---

## 6. Test Data Management

### Principles

- Test data is **deterministic** — same input always produces same state.
- Test data is **clearly identified** — fixture files labeled as test-only.
- Test data **never** contains real candidate/employee information.
- There is no seed file in `prisma/`; the only automated seed is `tests/e2e/support/seed.ts`, which writes to the dedicated test database only.
- Unit tests build their inputs inline in each test file (there are no shared factories).
- E2E tests use a dedicated test database, seeded before the test run.

### E2E Fixtures

`tests/e2e/support/fixtures.ts` defines everything the journeys rely on:

- Seeded staff accounts (admin, HR, mentor) and two published openings (internship, full-time) with fixed UUIDs and `E2E` names
- Email addresses on the reserved `.test` domain (e.g. `e2e-hr@example.test`)
- The test-only fixed one-time code and staff password (overridable with `E2E_STAFF_PASSWORD`)
- `newCandidateIdentity()` for the candidate each journey registers, with a unique run suffix so repeated runs on the same database never collide

---

## 7. Test Environment Rules

- The E2E test database is separate from the development database; the database guard enforces it.
- There is no `.env.test`. E2E variables are set in the shell (`E2E_DATABASE_URL`, optional `E2E_SERVER_MODE`, `E2E_PORT`, `E2E_STAFF_PASSWORD`); `playwright.config.ts` gives the app server its own environment.
- Tests must not depend on external services (email, AI, storage) being available. Unit tests mock infrastructure adapters; the E2E app server gets SMTP pointed at a closed local port, link-only document storage and virus scanning off.
- Without a test database, the E2E app server's `DATABASE_URL` points at a closed local port, so the public suite can never reach a real database.
- Tests must not depend on specific data in the development database.
- CI has no database: unit tests mock it and the build uses an unreachable placeholder URL.

---

## 8. What NOT To Do in Tests

- Do not skip tests to make CI green. Fix the test or document why it's temporarily disabled.
- Do not claim an OAuth/email/storage integration works unless tested with relevant configuration.
- Do not mock the database in integration tests (that defeats the purpose).
- Do not use `Math.random()` for fixture data — seeded fixtures use fixed UUIDs and names. The only exception is the unique run suffix of journey candidates (`newCandidateIdentity`), which keeps repeated runs on the same test database apart.
- Do not test implementation details (internal function call order). Test behavior and outcomes.
- Do not write tests that depend on execution order.
- Do not commit test database credentials.
