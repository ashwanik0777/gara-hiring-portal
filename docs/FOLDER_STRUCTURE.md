# Folder Structure — GARA Innovation Platform

> **Status:** Current repository layout (checked against the tree on 2026-11-01). Update this file when a route, portal, or feature module is added or removed.
>
> This structure follows the **"store project files outside of `app`"** strategy recommended by Next.js,
> using `src/` to separate application code from root configuration files.

---

## Repository Tree

```
/
├── CLAUDE.md                          # AI assistant persistent rules
├── AGENTS.md                          # Next.js agent rules (block re-added by `next dev`)
├── README.md                          # Project overview and setup
├── .env                               # Single local environment file (gitignored; variables listed in docs/RUNBOOK.md §2)
├── .gitignore                         # Git ignore rules
├── package.json                       # Dependencies and scripts
├── package-lock.json                  # Lockfile
├── next.config.ts                     # Next.js configuration
├── tsconfig.json                      # TypeScript configuration (`@/*` → `./src/*`)
├── eslint.config.mjs                  # ESLint configuration
├── postcss.config.mjs                 # Tailwind CSS v4 PostCSS plugin
├── prisma7.config.ts                  # Prisma CLI configuration (schema, migrations, DATABASE_URL)
├── vitest.config.ts                   # Unit test runner (jsdom, `@` alias)
├── playwright.config.ts               # End-to-end test runner
├── vercel.json                        # Vercel region
│
├── prisma/                            # Database schema and migrations
│   ├── schema.prisma                  # Prisma schema
│   └── migrations/                    # Versioned, append-only migrations
│
├── public/                            # Deliberately public static assets ONLY
│   └── brand/                         # Approved GARA logo and emblem files
│
├── worker/
│   └── jobs-worker.mjs                # Optional long-running scheduler that calls /api/jobs/run (`npm run worker`)
│
├── src/
│   ├── app/                           # Next.js App Router — routes, layouts, pages
│   │   ├── layout.tsx                 # Root layout (html, body, providers, fonts)
│   │   ├── page.tsx                   # Landing page  →  /
│   │   ├── globals.css                # Global styles / Tailwind imports
│   │   ├── loading.tsx                # Root loading skeleton
│   │   ├── error.tsx                  # Root error boundary
│   │   ├── not-found.tsx              # Root 404 page
│   │   ├── global-error.tsx           # Unrecoverable error fallback
│   │   ├── robots.ts, sitemap.ts      # Crawler files
│   │   ├── icon.png, apple-icon.png, favicon.ico
│   │   │
│   │   ├── (auth)/                    # Authentication pages (route group, not in the URL)
│   │   │   ├── layout.tsx
│   │   │   ├── login/                 # /login
│   │   │   ├── register/              # /register
│   │   │   ├── forgot-password/       # /forgot-password
│   │   │   ├── reset-password/        # /reset-password
│   │   │   └── set-password/          # /set-password (temporary-password accounts)
│   │   │
│   │   ├── careers/                   # Public openings
│   │   │   ├── page.tsx               # /careers
│   │   │   ├── [slug]/page.tsx        # /careers/[slug]
│   │   │   ├── [slug]/apply/page.tsx  # /careers/[slug]/apply
│   │   │   └── _lib/seo.ts            # JobPosting structured data
│   │   │
│   │   ├── verify/                    # Public certificate verification
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx               # /verify
│   │   │   └── [code]/page.tsx        # /verify/[code]
│   │   │
│   │   ├── help/page.tsx              # /help (FAQ and portal assistant)
│   │   ├── dashboard/page.tsx         # /dashboard — redirects to the signed-in user's portal
│   │   │
│   │   ├── candidate/                 # Candidate portal (also evaluation-stage and alumni users)
│   │   │   ├── layout.tsx
│   │   │   ├── _components/candidate-shell.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── applications/page.tsx
│   │   │   ├── applications/[id]/page.tsx
│   │   │   ├── interviews/[requestId]/page.tsx  # Interview slot booking
│   │   │   └── profile/page.tsx
│   │   │
│   │   ├── intern/                    # Evaluation / intern workspace
│   │   │   ├── layout.tsx
│   │   │   ├── _components/intern-shell.tsx
│   │   │   └── dashboard/page.tsx
│   │   │
│   │   ├── hrms/                      # Employee home and HR self-service
│   │   │   ├── layout.tsx
│   │   │   ├── _components/hrms-shell.tsx
│   │   │   ├── page.tsx               # /hrms
│   │   │   ├── attendance/page.tsx
│   │   │   ├── leave/page.tsx
│   │   │   └── payroll/page.tsx       # Own payslips; team view for authorized staff
│   │   │
│   │   ├── subadmin/                  # Staff workspace (HR, Manager, Interviewer, Mentor)
│   │   │   ├── layout.tsx
│   │   │   ├── _components/subadmin-shell.tsx
│   │   │   ├── page.tsx               # Role-specific workspace overview
│   │   │   ├── applications/          # page.tsx, [id]/page.tsx
│   │   │   ├── registrations/         # page.tsx, [userId]/page.tsx
│   │   │   ├── openings/              # page.tsx, new/, [id]/edit/, [id]/preview/
│   │   │   ├── interviews/
│   │   │   ├── evaluations/           # page.tsx, [id]/page.tsx
│   │   │   ├── intern-reviews/
│   │   │   ├── employees/             # page.tsx, [id]/page.tsx
│   │   │   ├── attendance/
│   │   │   ├── leave/
│   │   │   ├── payroll/
│   │   │   ├── reports/
│   │   │   └── chatbot/
│   │   │
│   │   ├── admin/                     # Administrator console: the subadmin/ modules plus:
│   │   │   ├── layout.tsx
│   │   │   ├── _components/admin-shell.tsx
│   │   │   └── subadmins/             # Staff accounts and granular permissions
│   │   │
│   │   └── api/                       # Route Handlers
│   │       ├── auth/[...all]/         # Better Auth handler
│   │       ├── auth/me/               # Current session summary for the navbar
│   │       ├── analytics/visitors/    # Public visitor counter
│   │       ├── candidate/applications/[id]/resume/  # Private resume download
│   │       ├── certificates/[id]/download/          # Certificate PDF
│   │       ├── certificates/verify/   # Public certificate verification API
│   │       ├── offers/[id]/letter/    # Offer letter PDF
│   │       ├── jobs/run/              # Background job runner (CRON_SECRET)
│   │       └── health/                # Health check
│   │
│   ├── features/                      # Domain modules — business logic lives here
│   │   ├── analytics/                 # Visitor counter, admin overview figures (services/)
│   │   ├── application-forms/         # Dynamic form builder, versioning, answer validation
│   │   ├── applications/              # Candidate applications and submissions
│   │   ├── attendance/                # Attendance records (POLICY-GATED: OD-006)
│   │   ├── auth/                      # Password set/change actions (password-actions.ts)
│   │   ├── automation/                # Job handlers: reminders, digests, scheduled conversions; traffic tick
│   │   ├── certificates/              # Certificate generation, reissue, verification
│   │   ├── chatbot/                   # Restricted FAQ assistant (PARTIALLY BLOCKED: OD-011)
│   │   ├── employees/                 # Offers, e-sign, joining, employee records, conversions
│   │   ├── intern-tasks/              # Intern task assignment & tracking
│   │   ├── internship-evaluation/     # 7-working-day evaluation and onboarding (PARTIALLY BLOCKED)
│   │   ├── leave/                     # Leave requests (POLICY-GATED: OD-007)
│   │   ├── lifecycle/                 # Candidate → intern → employee stages, portal capabilities, self-service
│   │   ├── notifications/             # Header notifications (actions.ts, services/)
│   │   ├── openings/                  # Job/internship openings
│   │   ├── payroll/                   # Payroll records and payouts (POLICY-GATED: OD-008)
│   │   ├── recruitment/               # Pipeline, stage transitions, interviews, booking, bulk actions
│   │   ├── reports/                   # Funnel, registrations, exports
│   │   ├── staff-dashboard/           # Role-specific staff workspaces and module access (workspace.ts)
│   │   └── subadmins/                 # Staff account and permission management
│   │
│   ├── components/                    # Shared UI components
│   │   ├── ui/                        # Primitives: badge, button, card, dialog-fallback, form-field, input, pagination-nav, skeleton, stat-card, toast
│   │   ├── dashboard/                 # Portal shell (dashboard-shell.tsx), sidebar sections (nav-sections.ts) and header notifications
│   │   ├── navigation/                # Navbar, footer, floating actions, navigation progress
│   │   ├── feedback/                  # Empty, error and unauthorized states, page skeletons
│   │   ├── auth/                      # Sign-in/registration screens and the one-time-code step
│   │   ├── analytics/                 # Visitor counter
│   │   ├── theme/                     # Theme toggle
│   │   └── verification/              # Certificate verification portal
│   │
│   ├── infrastructure/                # External provider adapters
│   │   ├── email/                     # Outbox processor + Nodemailer adapter, templates, ICS invites
│   │   ├── storage/                   # Private document storage (local), upload policy, virus scanning
│   │   ├── ai/                        # Assistant provider interface + approved FAQ knowledge base
│   │   ├── pdf/                       # Built-in vector PDF builder (certificates, offer letters)
│   │   └── jobs/                      # Database-backed job queue (job-queue.ts) and runner (job-runner.ts)
│   │
│   ├── lib/                           # Cross-cutting server-side utilities
│   │   ├── db.ts                      # Database client singleton
│   │   ├── env.ts                     # Environment variable validation (Zod)
│   │   ├── errors.ts                  # Error classes and safe error responses
│   │   ├── auth/                      # auth.ts (Better Auth), auth-client.ts, guards.ts, permissions.ts, roles.ts, home.ts, redirects.ts
│   │   ├── security/                  # Rate limiting, client IP hashing, field encryption, CRON_SECRET check
│   │   ├── logging/logger.ts          # Structured logging
│   │   ├── time/business-time.ts      # Business time zone helpers
│   │   ├── site-url.ts                # Canonical site URL
│   │   ├── pagination.ts              # Page numbers from the URL, clamped
│   │   ├── constants.ts
│   │   └── cn.ts, utils.ts            # General-purpose helpers
│   │
│   ├── config/
│   │   └── dashboard-nav.ts           # Admin console and staff HRMS navigation
│   │
│   ├── styles/                        # Design tokens, theme configuration
│   │   └── tokens.css                 # CSS custom properties for theming
│   │
│   └── types/
│       └── enums.ts                   # Client-safe copies of Prisma enums
│
├── tests/                             # All automated tests (committed)
│   ├── unit/                          # Vitest: services, schemas, utilities, components (database mocked)
│   └── e2e/                           # Playwright
│       ├── global-setup.ts            # Migrates and seeds the dedicated test database
│       ├── public/                    # Public suite (no database)
│       ├── journeys/                  # Database journeys (dedicated test database)
│       └── support/                   # Database guard, fixtures, seed, UI helpers
│
├── scripts/                           # Local operational scripts (gitignored, not in the repository)
│
├── docs/                              # All documentation
│   ├── PROJECT_BASELINE.md            # Product source of truth (owner-supplied)
│   ├── GARA_Innovation_Project.md     # Original project brief
│   ├── PROJECT_RULES.md               # Engineering standards
│   ├── FOLDER_STRUCTURE.md            # This file
│   ├── ARCHITECTURE.md                # System architecture
│   ├── CANDIDATE_LIFECYCLE.md         # Candidate → intern → employee stages
│   ├── SECURITY.md                    # Security policies
│   ├── TESTING.md                     # Test strategy
│   ├── DATA_MODEL.md                  # Database schema docs
│   ├── PAYROLL_REQUIREMENTS.md        # Payroll decisions needed from the owner
│   ├── OPEN_DECISIONS.md              # Unresolved business decisions
│   ├── RUNBOOK.md                     # Operational procedures
│   ├── SECURITY_REMEDIATION_CHECKLIST.md
│   └── decisions/                     # Architecture Decision Records
│       └── ADR-0001-modular-monolith.md
│
└── .github/
    └── workflows/
        └── ci.yml                     # Typecheck, lint, unit tests, build on every push to main and pull request
```

---

## Folder Responsibilities

### `src/app/` — Routing Layer

The App Router directory is **purely for routing orchestration**. Each file (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`) should be thin — importing and composing feature-level components, calling feature services, and applying authorization guards.

**Rules:**
- No business logic in route files.
- No direct database queries in pages — use feature `services/` (reads) or `actions.ts` (mutations).
- Each portal is a top-level folder whose name is the URL prefix: `candidate/`, `intern/`, `hrms/`, `subadmin/`, `admin/`. Its `layout.tsx` renders the portal shell from `_components/` (private folder, not routed), which checks the session and role before rendering. Pages still authorize themselves.
- Public pages (`careers/`, `verify/`, `help/`, the landing page) sit at the top level; `(auth)` is the only route group and does NOT appear in URLs.
- The staff modules exist twice, under `subadmin/` and `admin/`, with the same feature components.

### `src/features/<domain>/` — Domain Modules

Each domain module encapsulates its own business logic. A module should only contain the files and subfolders it actually needs — do not create empty directories.

**Standard entries (create as needed):**
| Entry | Purpose |
|---|---|
| `components/` | Domain-specific React components |
| `services/` | Business logic and data reads (server-only) |
| `actions.ts` | Server Actions (form submissions, mutations); large modules split them, e.g. `recruitment/booking-actions.ts`, `recruitment/bulk-actions.ts` |
| `schemas.ts` | Zod validation schemas |
| `types.ts` | Domain-specific TypeScript types |

Email templates live in `src/infrastructure/email/`, not in feature modules.

**Import rules:**
- Features may import from `lib/`, `components/`, `infrastructure/`, `config/`, `types/`.
- Features must NOT import from other features' `services/` or `actions/` directly. Shared logic goes to `lib/` or a clearly documented shared service.
- Features must NOT import from `src/app/`.

### `src/components/` — Shared UI

| Folder | Purpose |
|---|---|
| `ui/` | Design system primitives: Badge, Button, Card, Input, Skeleton, PaginationNav, StatCard, DialogFallback; `form-field` (shared staff-form controls: label row with Optional and counters, choice tiles, field groups; no hint lines) and `toast` (`toast.success/info/error` with the `<Toaster />` mounted in the root layout; confirmations go to toasts, form errors stay next to the form). Accessible, themeable, no business logic. |
| `dashboard/` | Portal shell (sidebar, header, mobile navigation) shared by every portal, and header notifications. Sidebar items may carry a `group`; consecutive items with the same group render under one heading (`nav-sections.ts`), items without a group stand alone. A group heading opens and closes its links; the choice is remembered per browser and portal (`use-collapsed-nav-groups.ts`), and the group holding the current page opens when that page is opened. |
| `navigation/` | Public navbar, footer, floating actions, navigation progress bar. |
| `feedback/` | Empty states, friendly error and unauthorized states, page skeletons. |
| `auth/`, `analytics/`, `theme/`, `verification/` | Auth screens, visitor counter, theme toggle, certificate verification portal. |

### `src/infrastructure/` — Provider Adapters

Each subdirectory wraps one external concern (email, storage, AI, PDF, background jobs) behind an interface or a small service so business modules never call provider SDKs directly.

This allows swapping providers (e.g., SMTP → a transactional email API) without modifying business logic.

### `src/lib/` — Cross-Cutting Utilities

Server-side utilities shared across all features (`auth-client.ts`, `roles.ts`, `cn.ts` and `utils.ts` are also used by Client Components). Server-only modules must never be imported from Client Components.

### `src/config/` — Application Constants

Static configuration values such as navigation definitions (`dashboard-nav.ts`). Roles live in `src/lib/auth/roles.ts` and the site URL in `src/lib/site-url.ts`. Not environment variables (those go in `lib/env.ts`).

### `prisma/` — Database

Schema and versioned migrations (append-only). There is no seed file in the repository: local seed scripts live in the gitignored `scripts/` folder, and the E2E fixtures are seeded by `tests/e2e/support/seed.ts` into the dedicated test database only.

### `tests/` — Automated Tests

Separate directories by test type (see `docs/TESTING.md`):
- `unit/` — Vitest, a flat folder of `*.test.ts(x)` files grouped by domain plus `helpers/` (shared mock adapters); the database is mocked
- `e2e/` — Playwright `*.e2e.ts` specs: `public/` needs no database, `journeys/` runs against a dedicated test database, `support/` holds the shared helpers

### `public/` — Public Assets Only

**CRITICAL:** Only deliberately public assets belong here. Never place:
- Resumes, cover letters, or candidate documents
- Employee records, payslips, or ID documents
- Offer letters or internal evaluation documents
- Private certificates or internal reports

---

## Route Plan

### URL Mapping (No Collisions)

| Folder | URL Path | Auth Required | Who |
|---|---|---|---|
| `page.tsx` | `/` | No | Public |
| `careers/` | `/careers`, `/careers/[slug]` | No | Public |
| `careers/` | `/careers/[slug]/apply` | To submit | Candidate |
| `verify/` | `/verify`, `/verify/[code]` | No | Public |
| `help/` | `/help` | No | Public (assistant personalised when signed in) |
| `(auth)` | `/login`, `/register`, `/forgot-password`, `/reset-password` | No | Guest |
| `(auth)` | `/set-password` | Yes | Accounts with a temporary password |
| `dashboard/` | `/dashboard` | Yes | Anyone — redirects to their portal |
| `candidate/` | `/candidate/dashboard`, `/candidate/applications`, `/candidate/applications/[id]`, `/candidate/interviews/[requestId]`, `/candidate/profile` | Yes | Candidate, evaluation stage, alumni (per lifecycle capability) |
| `intern/` | `/intern/dashboard` | Yes | Evaluation stage and interns |
| `hrms/` | `/hrms` | Yes | Employees |
| `hrms/` | `/hrms/attendance`, `/hrms/leave`, `/hrms/payroll` | Yes | Interns and employees (own records); staff |
| `subadmin/` | `/subadmin` and `/subadmin/{applications, registrations, openings, interviews, evaluations, intern-reviews, employees, attendance, leave, payroll, reports, chatbot}` | Yes | HR, Manager, Interviewer, Mentor — modules shown by role and granular permission |
| `admin/` | `/admin`, the same modules under `/admin/…`, and `/admin/subadmins` | Yes | Admin |

### Collision Avoidance Notes

- Every portal has its own URL prefix (`/candidate/`, `/intern/`, `/hrms/`, `/subadmin/`, `/admin/`), so no two portals produce the same path.
- Staff modules share the same feature components under `/subadmin/` and `/admin/`.
- The `(auth)` group owns `/login`, `/register`, `/forgot-password`, `/reset-password`, `/set-password`.
- Public pages own `/`, `/careers`, `/verify`, `/help`.
- `/dashboard` is only a redirect hub (`resolveHomePath`), not a page of its own.

---

## Import Direction (Dependency Rules)

```
src/app/        →  imports from  →  src/features/, src/components/, src/lib/, src/config/
src/features/   →  imports from  →  src/lib/, src/components/, src/infrastructure/, src/config/, src/types/
src/components/ →  imports from  →  src/lib/, src/config/, src/types/
src/lib/        →  imports from  →  src/infrastructure/ (for DB, adapters), src/config/, src/types/
src/infrastructure/ → imports from → external packages, src/config/, src/types/
```

**Never:**
- `src/features/` → `src/app/`
- `src/lib/` → `src/features/`
- `src/components/ui/` → `src/features/`
- `src/infrastructure/` → `src/features/`
- Any client bundle → `src/lib/db.ts`, `src/lib/auth/auth.ts`, `src/lib/auth/guards.ts`, or server secrets

---

## Where Does a New Feature Belong?

| Scenario | Location |
|---|---|
| New business domain (e.g., performance reviews) | `src/features/performance-reviews/` with needed entries |
| New page for an existing domain | `src/app/<portal>/path/page.tsx` — thin, imports from feature (staff modules: both `subadmin/` and `admin/`) |
| New reusable UI primitive | `src/components/ui/` |
| New reusable composed component | `src/components/<area>/` (e.g. `dashboard/`, `feedback/`) |
| New external provider integration | `src/infrastructure/<concern>/` with adapter interface |
| New cross-cutting utility | `src/lib/<category>/` |
| New shared type | `src/types/` |
| New database table | `prisma/schema.prisma` + migration |
| New configuration constant | `src/config/` |
| New background job | Handler in `src/features/automation/`, registered in `registry.ts` |
| New architecture decision | `docs/decisions/ADR-NNNN-title.md` |
