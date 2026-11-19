# Architecture — GARA Innovation Platform

> **Status:** Implemented architecture (checked against the repository on 2026-11-01): Next.js 16.4 App Router, React 19.3, Prisma 7 on PostgreSQL, Better Auth. Directory layout: `docs/FOLDER_STRUCTURE.md`.

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
1. The module's `services/` already encapsulate its logic.
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
│   Components │ Actions │ Services │ Schemas │ Types  │
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
2. **Route/Page** (src/app/) → Authenticates user via `lib/auth/guards.ts` (the portal shell in the layout, then the page itself), checks authorization
3. **Feature Service/Action** (src/features/) → Executes business logic, validates input via schemas
4. **Database** → Prisma client queries PostgreSQL via `lib/db`
5. **Infrastructure Adapter** (if needed) → Sends email, stores file, generates PDF
6. **Response** → Server-rendered HTML (Server Component) or JSON (Route Handler)

### Server Action Flow

1. **Client Component** → Calls Server Action
2. **Server Action** (`src/features/*/actions.ts`) → Validates session, validates input (Zod), calls service
3. **Service** → Executes business logic, enforces state transitions, writes to DB
4. **Response** → Returns safe result type (success/error) to client

---

## 3. Module Boundaries

### Domain Modules (src/features/)

Each domain module encapsulates one business concern. Modules interact through well-defined boundaries:

| Module | Owns | Depends On |
|---|---|---|
| `auth` | Password set/change actions; users, sessions and credentials are Better Auth in `src/lib/auth` | `lib/auth`, `lifecycle` |
| `openings` | Job/internship openings, form definitions | `application-forms` |
| `application-forms` | Dynamic form definitions, versioning, answer validation | `openings`, `applications` |
| `applications` | Candidate applications, submissions, private document links | `application-forms`, `recruitment`, `lifecycle`, `infrastructure/storage`, `infrastructure/email` |
| `recruitment` | Recruitment pipeline, stage transitions, interview scheduling, slot booking, feedback, bulk actions | `applications`, `application-forms`, `automation`, `lifecycle`, `infrastructure/email` |
| `internship-evaluation` | 7-working-day evaluation, checkpoints, results, onboarding, intern ID card | `recruitment`, `employees`, `intern-tasks`, `certificates`, `infrastructure/email` |
| `intern-tasks` | Task assignment, tracking, completion, progress reports | `employees`, `internship-evaluation` |
| `certificates` | Certificate generation, reissue, verification, QR | `internship-evaluation`, `infrastructure/pdf` |
| `employees` | Offers and e-sign, joining, employee records, intern-to-employee conversion | `recruitment`, `internship-evaluation`, `lifecycle`, `payroll`, `automation`, `infrastructure/email`, `infrastructure/jobs`, `infrastructure/pdf` |
| `lifecycle` | Lifecycle stage (candidate, evaluation, intern, employee, alumni), portal capabilities, home path, self-service pages | `recruitment`, `internship-evaluation`, `employees`, `attendance`, `certificates`, `automation` |
| `attendance` | Clock-in/out, daily records | — |
| `leave` | Leave requests, approvals | `attendance` |
| `payroll` | Payroll periods and records, payout profiles, payslips (no salary computation) | — |
| `notifications` | Header notifications for the signed-in user | `recruitment` (staff application visibility) |
| `automation` | Background job handlers (interview and checkpoint reminders, conversion reviews, staff digest), recurring-job registry, traffic-triggered tick, action centre | `recruitment`, `internship-evaluation`, `employees`, `infrastructure/jobs`, `infrastructure/email` |
| `chatbot` | Conversational interface, FAQ | `infrastructure/ai` |
| `analytics` | Public visitor counter, admin overview figures | `reports` |
| `reports` | Hiring funnel, registrations, exports | Read-only access to `applications`, `analytics`, `lifecycle`, `staff-dashboard` |
| `staff-dashboard` | Role-specific staff overviews (HR, manager, interviewer, mentor) and the module-access map used by staff navigation | Read-only access to `recruitment`, `internship-evaluation`, `applications`, `attendance`, `payroll`, `lifecycle`, `automation` |
| `subadmins` | Staff accounts and granular permissions (administrator only) | `infrastructure/email` |

"Depends On" lists the modules each module actually imports. Some pairs currently import each other (for example `applications` ↔ `recruitment`, `employees` ↔ `automation`), contrary to rule 4 below.

Audit entries (`AuditLog`) are written by the services and actions of each module next to the change they record; there is no separate audit module.

### Portals and Role-Specific Staff Workspaces

| Portal | Who | Shell |
|---|---|---|
| `/candidate/*` | Candidates, evaluation-stage users, alumni | `SelfServiceShell` (`src/features/lifecycle`) — navigation follows the lifecycle stage |
| `/intern/*` | Evaluation-stage users and interns | `SelfServiceShell` |
| `/hrms/*` | Employees; interns for attendance, leave and payslips; staff for team views | `SelfServiceShell` (staff get the HRMS navigation) |
| `/subadmin/*` | HR, Manager, Interviewer, Mentor | `SubAdminShell` |
| `/admin/*` | Admin | `AdminShell` |

`/dashboard` and the post-login redirect send each user to their portal (`resolveHomePath`, `getHomePathForUser`). In the staff workspace, `src/features/staff-dashboard/workspace.ts` maps roles to workspaces — HR (also shown to Admin), Manager, Interviewer, Mentor; a person with several roles sees the union, most senior first — and lists only the modules allowed by both the module's role rule and the user's granular permissions. Pages and Server Actions still authorize every request themselves.

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
EmailTransportAdapter        → NodemailerEmailAdapter (SMTP), driven by OutboxProcessorService
StorageService               → LocalStorageService (private disk storage; DOCUMENT_STORAGE_MODE=link collects share links instead)
AiProviderAdapter            → PortalAssistantProvider (approved FAQ knowledge base; no external model configured — OD-011)
PdfGeneratorService          → CertificatePdfGenerator and the offer-letter generator, both on vector-pdf-builder.ts
Job queue                    → enqueueJob / runDueJobs on the ScheduledJob table (src/infrastructure/jobs)
```

### Adapter Design Principles

- Business modules import the **interface**, not the implementation.
- A factory or configuration module selects the concrete implementation based on environment.
- Provider downtime must not corrupt database state. Use transactions and idempotent operations.
- Adapter implementations are in `src/infrastructure/<concern>/`.

### Background Job System

- **Queue:** `ScheduledJob` rows in PostgreSQL. `enqueueJob` takes an optional `dedupeKey` (re-enqueueing moves the pending job instead of duplicating it) and accepts the transaction client, so a job is created atomically with the change that needs it.
- **Runner:** `runDueJobs` claims due jobs with a conditional `PENDING → RUNNING` update, so concurrent triggers never run the same job twice; failures retry with a growing delay, and jobs left `RUNNING` for 10 minutes are recovered. Handlers must be idempotent.
- **Email:** notification emails are written to the `NotificationOutbox` table and delivered by `OutboxProcessorService` (after the response where an action calls `scheduleOutboxFlush`, and in every automation run). Sign-in one-time codes are time-critical and sent directly.
- **Handlers:** `src/features/automation/registry.ts` (interview reminders, checkpoint reminders, conversion reviews, staff digest, scheduled conversions) and the recurring jobs it seeds.
- **Triggers (no platform cron):** `GET|POST /api/jobs/run` with `Authorization: Bearer <CRON_SECRET>`, called by an external scheduler, a crontab or `npm run worker` (`worker/jobs-worker.mjs`); and `scheduleAutomationTick()` in the portal shells, which runs a small batch after the response at most once a minute per server instance.

---

## 5. State Management & Workflow History

### Application/Recruitment Pipeline

Candidate applications move through explicit, server-enforced states:

```
DRAFT → SUBMITTED → SCREENING → SHORTLISTED → INTERVIEW_SCHEDULED → INTERVIEWED →
EVALUATION_SELECTED (internships) / OFFERED → OFFER_ACCEPTED → HIRED
REJECTED / WITHDRAWN → ARCHIVED
```

- The allowed transitions are `VALID_APPLICATION_TRANSITIONS` in `src/features/recruitment/schemas.ts`; `EVALUATION_SELECTED`, `OFFERED`, `OFFER_ACCEPTED` and `HIRED` are reachable only through their dedicated flows (`FLOW_OWNED_APPLICATION_STATUSES`).
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
PENDING → APPROVED / REJECTED
```

- `CANCELLED` exists in the schema but no cancellation flow is implemented.
- Policy logic (balances, accrual) blocked until OD-007 is resolved.

### Certificate Lifecycle

```
ACTIVE (issued) → reissued: same record, new verification code
```

- A reissue keeps the certificate `ACTIVE` with a new code; the previous code is kept in `CertificateReissueHistory` and verifies as "superseded". `REVOKED` and `SUPERSEDED` exist in the schema, but no revocation flow is implemented.
- Eligibility rules blocked until OD-009 is resolved.
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

- Session validation happens in `src/lib/auth/guards.ts` (`getCurrentUser`, memoised per request, and `requireAuth`) on top of Better Auth (`src/lib/auth/auth.ts`).
- Layout-level checks redirect unauthenticated users.
- Every Server Action and Route Handler re-validates the session (never trust layout-level checks alone).

### Authorization Boundary

- Role-based + record-level access control.
- Authorization checks happen in feature services, close to the data operation.
- Middleware/proxy redirects are UX conveniences, not security controls.
- A documented role/permission matrix defines who can access what.

### Data Boundary

- Confidential data (resumes, employee records, payroll) is never in `public/`.
- Private files are served only by Route Handlers that authorize the request and respond with `Cache-Control: no-store` (resume download, certificate PDF, offer letter); there are no public or permanent file URLs.
- API responses never include fields the requesting user is not authorized to see.
- Error responses never expose stack traces, database details, or internal IDs to unauthorized users.

---

## 8. Stack Decisions (Resolved)

The decisions listed for the Prompt 0 audit have been made:

| Decision | Outcome |
|---|---|
| ORM | Prisma 7 with `@prisma/adapter-pg`; CLI configuration in `prisma7.config.ts` |
| `src/` directory | In place; `@/*` resolves to `./src/*` |
| Auth library | Better Auth: email/password + Google, emailed one-time code on every password sign-in |
| Tailwind CSS 4 | `@tailwindcss/postcss` (`postcss.config.mjs`); design tokens in `src/styles/tokens.css` |
| Validation | Zod 4 for server-side validation of untrusted input |
| Background jobs | Database-backed job queue and email outbox (§4) |
| PDF generation | Built-in vector PDF builder (`src/infrastructure/pdf`), `qrcode` for QR codes; no headless browser |
| Test framework | Vitest (`tests/unit`) |
| E2E test framework | Playwright (`tests/e2e`) |

---

## 9. Deployment Considerations (Future)

- Single deployable Next.js application.
- PostgreSQL database (managed service recommended for production).
- Environment-based configuration (dev, staging, production).
- CI: `.github/workflows/ci.yml` runs typecheck, lint, unit tests and the production build on every push to `main` and every pull request; the Playwright suites run locally (`docs/RUNBOOK.md` §3.1).
- Scheduled work needs no platform cron: see §4 Background Job System.
- No specific hosting provider assumed — document requirements for Vercel, Railway, AWS, etc.
- Static assets via CDN where appropriate.
