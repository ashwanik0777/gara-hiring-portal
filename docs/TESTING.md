# Testing Strategy — GARA Innovation Platform

> **Status:** Test strategy documentation. Test framework selection and initial setup occur during Prompt 0/1.

---

## 1. Test Layers

### Unit Tests (`tests/unit/`)

**Purpose:** Test individual functions, services, and utilities in isolation.

**What to test:**
- Business logic in `src/features/*/services/`
- Validation schemas (`src/features/*/schemas/`)
- Utility functions (`src/lib/utils/`)
- Error handling and edge cases
- State transition validation logic
- Data transformation functions

**Characteristics:**
- No database, no network, no filesystem
- Fast execution (< 1 second per test)
- Mock external dependencies
- High coverage of business rules

**Framework:** Vitest (recommended — to be validated in Prompt 0 for Next.js 16.4 compatibility)

### Integration Tests (`tests/integration/`)

**Purpose:** Test database-backed flows, authorization, API routes, and cross-module interactions.

**What to test:**
- Server Actions with real database operations
- Route Handlers with authentication/authorization
- Database constraints and unique violations
- State transitions end-to-end (e.g., application pipeline)
- Role-based access control (permitted + forbidden)
- Record-level ownership enforcement

**Characteristics:**
- Use a test database (same schema, separate instance)
- Run migrations before test suite
- Each test gets a clean state (transaction rollback or truncation)
- Slower than unit tests but necessary for confidence

**Framework:** Vitest with test database setup (to be validated)

### End-to-End Tests (`tests/e2e/`)

**Purpose:** Test critical user journeys in a real browser at realistic viewports.

**What to test:**
- Candidate registration → application submission → status tracking
- Staff login → review application → schedule interview → provide feedback
- Intern task completion → progress view
- Certificate verification (public)
- Authentication flows (login, logout, password reset)
- Responsive behavior (mobile, tablet, desktop)
- Accessibility (keyboard navigation, screen reader basics)

**Characteristics:**
- Run against a running application with seeded test data
- Test at multiple viewports: mobile (375px), tablet (768px), desktop (1280px)
- Slower; run in CI but not on every keystroke

**Framework:** Playwright (recommended — to be validated in Prompt 0)

---

## 2. Test Directory Structure

```
tests/
├── unit/
│   ├── features/
│   │   ├── auth/
│   │   │   └── auth-service.test.ts
│   │   ├── applications/
│   │   │   ├── application-service.test.ts
│   │   │   └── application-schema.test.ts
│   │   └── ...
│   ├── lib/
│   │   ├── validation.test.ts
│   │   └── utils.test.ts
│   └── infrastructure/
│       └── email-adapter.test.ts
│
├── integration/
│   ├── features/
│   │   ├── auth/
│   │   │   ├── login.test.ts
│   │   │   └── registration.test.ts
│   │   ├── applications/
│   │   │   ├── submit-application.test.ts
│   │   │   └── application-access.test.ts
│   │   └── ...
│   ├── api/
│   │   └── verify-certificate.test.ts
│   └── setup.ts              # DB connection, migration, cleanup
│
├── e2e/
│   ├── candidate-journey.spec.ts
│   ├── recruitment-workflow.spec.ts
│   ├── auth-flow.spec.ts
│   ├── certificate-verification.spec.ts
│   └── responsive.spec.ts
│
├── fixtures/
│   ├── users.ts              # Test user data
│   ├── openings.ts           # Test openings data
│   └── applications.ts       # Test application data
│
└── helpers/
    ├── db.ts                 # Test database utilities
    ├── auth.ts               # Test authentication helpers
    ├── factories.ts          # Test data factories
    └── matchers.ts           # Custom test matchers
```

---

## 3. Critical Test Journeys

### Must-Have Test Coverage

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

To be configured during Prompt 0/1 after framework selection. Target pipeline:

```bash
# 1. Format check
npx prettier --check .

# 2. Lint
npx eslint .

# 3. TypeScript type check
npx tsc --noEmit

# 4. Unit tests
npx vitest run --project unit

# 5. Integration tests
npx vitest run --project integration

# 6. Production build
npm run build

# 7. E2E tests (against built app)
npx playwright test

# 8. Migration check (ensure schema and migrations are in sync)
npx prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --exit-code
```

> Exact commands depend on tooling selected in Prompt 0. These are representative targets.

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
- Test data is **clearly identified** — factory functions, fixture files, or seed scripts labeled as test-only.
- Test data **never** contains real candidate/employee information.
- `prisma/seed.ts` is for development/test only — it must be clearly marked and never run against production.
- Each integration test cleans up after itself (transaction rollback or truncation).
- E2E tests use a dedicated test database, seeded before the test run.

### Test Data Factories

Use factory functions (in `tests/helpers/factories.ts`) to create test entities with sensible defaults but customizable fields:

```typescript
// Example pattern (not implemented yet)
function createTestUser(overrides?: Partial<UserInput>): UserInput {
  return {
    email: `test-${randomId()}@example.com`,
    name: 'Test User',
    role: 'CANDIDATE',
    ...overrides,
  };
}
```

---

## 7. Test Environment Rules

- Test database is separate from development database.
- Test environment variables are in `.env.test` (not committed; documented in `.env.example`).
- Tests must not depend on external services (email, AI, storage) being available. Mock infrastructure adapters.
- Tests must not depend on specific data in the development database.
- CI runs tests in an isolated environment with its own database.

---

## 8. What NOT To Do in Tests

- Do not skip tests to make CI green. Fix the test or document why it's temporarily disabled.
- Do not claim an OAuth/email/storage integration works unless tested with relevant configuration.
- Do not mock the database in integration tests (that defeats the purpose).
- Do not use `Math.random()` for test data — use deterministic factories.
- Do not test implementation details (internal function call order). Test behavior and outcomes.
- Do not write tests that depend on execution order.
- Do not commit test database credentials.
