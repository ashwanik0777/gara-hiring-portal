# Architecture — GARA Innovation Platform

> **Status:** Proposed architecture. Requires Prompt 0 validation against the repository and stack compatibility.

---

## 1. Architectural Approach: Modular Monolith

GARA Innovation begins as a **modular monolith** — a single Next.js full-stack application with clearly separated business domains, shared infrastructure adapters, and explicit module boundaries.

See [ADR-0001](decisions/ADR-0001-modular-monolith.md) for the full decision record.

### Why Not Microservices

- The team is small; operational overhead of multiple services (separate deployments, service discovery, distributed transactions) is unjustified.
- The product is in its first version — domain boundaries will shift as requirements are clarified.
- A monolith with clean module boundaries can be split later if scale demands it.
- Next.js Server Components, Server Actions, and Route Handlers provide natural server/client separation within a single deployment.

### Future Extraction Path

If a module (e.g., payroll, certificate verification) needs independent scaling or deployment:
1. The module's `services/` and `queries/` already encapsulate its logic.
2. Extract the module into a standalone service behind an API.
3. Replace the in-process calls with HTTP/gRPC adapter calls.
4. The infrastructure adapter pattern makes this migration incremental.

---

## 2. Layer Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Presentation                      │
│         src/app/ (Routes, Layouts, Pages)            │
│    Server Components + Client Components as needed   │
├─────────────────────────────────────────────────────┤
│                   Feature Layer                      │
│              src/features/<domain>/                  │
│   Components │ Actions │ Services │ Queries │ Types  │
├─────────────────────────────────────────────────────┤
│                  Shared Layer                        │
│     src/components/  │  src/lib/  │  src/config/     │
│   UI primitives, auth helpers, validation, errors    │
├─────────────────────────────────────────────────────┤
│               Infrastructure Layer                   │
│              src/infrastructure/                     │
│    Email │ Storage │ AI │ PDF │ Background Jobs      │
├─────────────────────────────────────────────────────┤
│                   Data Layer                         │
│           prisma/ (Schema, Migrations)               │
│              PostgreSQL Database                     │
└─────────────────────────────────────────────────────┘
```

### Data Flow (Typical Request)

1. **Browser** → HTTP request to Next.js
2. **Route/Page** (src/app/) → Authenticates user via `lib/auth`, checks authorization
3. **Feature Service/Action** (src/features/) → Executes business logic, validates input via schemas
4. **Database** → Prisma client queries PostgreSQL via `lib/db`
5. **Infrastructure Adapter** (if needed) → Sends email, stores file, generates PDF
6. **Response** → Server-rendered HTML (Server Component) or JSON (Route Handler)

### Server Action Flow

1. **Client Component** → Calls Server Action
2. **Server Action** (src/features/*/actions/) → Validates session, validates input (Zod), calls service
3. **Service** → Executes business logic, enforces state transitions, writes to DB
4. **Response** → Returns safe result type (success/error) to client

---

## 3. Module Boundaries

### Domain Modules (src/features/)

Each domain module encapsulates one business concern. Modules interact through well-defined boundaries:

| Module | Owns | Depends On |
|---|---|---|
| `auth` | Users, sessions, credentials | `lib/auth`, `infrastructure/email` |
| `openings` | Job/internship openings, form definitions | `auth` (ownership) |
| `application-forms` | Dynamic form definitions, versioning | `openings` |
| `applications` | Candidate applications, submissions | `openings`, `application-forms`, `infrastructure/storage` |
| `recruitment` | Recruitment pipeline, stage transitions | `applications`, `openings` |
| `interviews` | Scheduling, feedback, scorecards | `recruitment`, `applications` |
| `internship-evaluation` | Evaluation periods, criteria, results | `employees`, `intern-tasks`, `progress` |
| `onboarding` | Onboarding checklists, document collection | `employees`, `infrastructure/storage` |
| `intern-tasks` | Task assignment, tracking, completion | `employees` |
| `progress` | Progress monitoring, milestones | `intern-tasks` |
| `certificates` | Certificate generation, verification, QR | `internship-evaluation`, `infrastructure/pdf` |
| `employees` | Employee records, roles, profiles | `auth` |
| `attendance` | Clock-in/out, daily records | `employees` |
| `leave` | Leave requests, balances, approvals | `employees`, `attendance` |
| `payroll` | Salary computation, payslips | `employees`, `attendance`, `leave` |
| `notifications` | Email/in-app notification orchestration | `infrastructure/email`, `infrastructure/jobs` |
| `chatbot` | Conversational interface, FAQ | `infrastructure/ai`, `auth` |
| `reports` | Cross-module reporting | Read-only access to multiple modules |
| `staff-dashboard` | Role-specific staff overviews (HR, manager, interviewer, mentor) and the module-access map used by staff navigation | Read-only access to `recruitment`, `internship-evaluation`, `employees`, `attendance`, `leave` |
| `audit` | Activity logs, change history | All modules (passive listener) |

### Cross-Module Communication Rules

1. **Direct imports** are allowed only for types and read-only queries between closely related modules.
2. **Shared business logic** moves to `src/lib/` if needed by 3+ modules.
3. **Side effects** (e.g., "send notification when application status changes") should be explicit — called from the service, not triggered by implicit hooks.
4. **No circular dependencies.** If module A depends on module B, module B must not depend on module A.

---

## 4. Provider Adapters (Infrastructure Layer)

Each external provider is wrapped in an adapter that implements a stable interface:

```
Interface (contract)          Implementation (provider-specific)
───────────────────          ──────────────────────────────────
EmailAdapter                 → NodemailerEmailAdapter
StorageAdapter               → S3StorageAdapter / LocalStorageAdapter
AIAdapter                    → (pending provider approval - OD-012)
PDFAdapter                   → (to be selected in Prompt 0/1)
JobAdapter                   → (to be selected in Prompt 0/1)
```

### Adapter Design Principles

- Business modules import the **interface**, not the implementation.
- A factory or configuration module selects the concrete implementation based on environment.
- Provider downtime must not corrupt database state. Use transactions and idempotent operations.
- Adapter implementations are in `src/infrastructure/<concern>/<provider>.ts`.

---

## 5. State Management & Workflow History

### Application/Recruitment Pipeline

Candidate applications move through explicit, server-enforced states:

```
DRAFT → SUBMITTED → UNDER_REVIEW → SHORTLISTED → INTERVIEW_SCHEDULED →
INTERVIEWED → OFFERED → ACCEPTED → REJECTED / WITHDRAWN / ARCHIVED
```

- Each transition is validated server-side (no client-trusted status changes).
- Each transition is recorded with timestamp, actor, and optional notes.
- Invalid transitions are rejected with clear error messages.
- History is preserved — status changes are appended, never overwritten.

### Internship Evaluation & Onboarding *(Implemented in Prompt 5)*

```
Enrollment: PENDING_TRIGGER → IN_PROGRESS → UNDER_REVIEW → PASSED / FAILED / EXTENDED
Onboarding: PENDING → IN_PROGRESS → COMPLETED
ID Card:    PENDING_APPROVAL → APPROVED → ISSUED / REVOKED
```

- Trigger is guarded by explicit manual action per OD-001; 7 working days computed via `WorkingDayService` per OD-002.
- Final pass/fail review requires human sign-off per OD-003.
- ID card issuance strictly gated by `PASSED` evaluation + `COMPLETED` onboarding checklist + `ADMIN`/`HR` role per OD-014.

### Leave Requests

```
DRAFT → SUBMITTED → APPROVED / REJECTED → CANCELLED (if applicable)
```

- Policy logic blocked until OD-006 is resolved.

### Certificate Lifecycle

```
ELIGIBLE → GENERATED → ISSUED → REVOKED (if correction needed) → REISSUED
```

- Eligibility rules blocked until OD-008 is resolved.
- Each certificate has a unique verification ID and QR code.
- Verification endpoint is public but returns only approved minimum information.

---

## 6. Server/Client Boundaries

### Server Components (Default)

All pages, layouts, and data-fetching components are Server Components by default in Next.js 16.4. They:
- Execute on the server only
- Can directly access the database, environment variables, and secrets
- Never ship to the client bundle
- Cannot use `useState`, `useEffect`, or browser APIs

### Client Components (Opt-in)

Marked with `'use client'` directive. Used only for:
- Interactive forms with client-side validation UX
- Stateful UI (modals, dropdowns, tabs, theme toggles)
- Browser APIs (clipboard, geolocation, media)
- Real-time updates (WebSocket, polling)

### Boundary Rules

| Concern | Server | Client |
|---|---|---|
| Data fetching | ✅ | ❌ (use Server Actions) |
| Database access | ✅ | ❌ |
| Environment secrets | ✅ | ❌ |
| Business logic | ✅ | ❌ |
| Input validation (security) | ✅ | ❌ (UX-only on client) |
| Form state & interactions | ❌ | ✅ |
| Theme/dark mode toggle | ❌ | ✅ |
| Animations, transitions | ❌ | ✅ |

---

## 7. Security Boundaries

### Authentication Boundary

- Session validation happens in `src/lib/auth/session.ts`.
- Layout-level checks redirect unauthenticated users.
- Every Server Action and Route Handler re-validates the session (never trust layout-level checks alone).

### Authorization Boundary

- Role-based + record-level access control.
- Authorization checks happen in feature services, close to the data operation.
- Middleware/proxy redirects are UX conveniences, not security controls.
- A documented role/permission matrix defines who can access what.

### Data Boundary

- Confidential data (resumes, employee records, payroll) is never in `public/`.
- File access requires authorization + time-limited signed URLs from the storage adapter.
- API responses never include fields the requesting user is not authorized to see.
- Error responses never expose stack traces, database details, or internal IDs to unauthorized users.

---

## 8. Decisions Requiring Prompt 0 Verification

The following architectural decisions are proposed but need validation during the Prompt 0 audit:

| Decision | What Needs Verification |
|---|---|
| Prisma as ORM | Stable version compatibility with Next.js 16.4, React 19.3, Node.js version |
| `src/` directory migration | Confirm build works after moving `app/` to `src/app/` |
| Auth library selection | Evaluate Auth.js / Lucia / custom — compatibility with Next.js 16.4 |
| Tailwind CSS 4 | Already installed — verify configuration approach for v4 |
| Zod for validation | Version compatibility, integration with Server Actions |
| Background jobs approach | Evaluate options (pg-boss, BullMQ, database-backed outbox) |
| PDF generation library | Evaluate options (Puppeteer, @react-pdf/renderer, etc.) |
| Test framework | Vitest vs. Jest — compatibility with Next.js 16.4 |
| E2E test framework | Playwright vs. Cypress — evaluate based on project needs |

---

## 9. Deployment Considerations (Future)

- Single deployable Next.js application.
- PostgreSQL database (managed service recommended for production).
- Environment-based configuration (dev, staging, production).
- CI/CD pipeline with quality gates (lint, typecheck, test, build).
- No specific hosting provider assumed — document requirements for Vercel, Railway, AWS, etc.
- Static assets via CDN where appropriate.
