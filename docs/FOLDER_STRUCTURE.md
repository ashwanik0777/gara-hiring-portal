# Folder Structure — GARA Innovation Platform

> **Status:** Documentation-only proposal. No application directories are created until Prompt 1 is approved.
>
> This structure follows the **"store project files outside of `app`"** strategy recommended by Next.js,
> using `src/` to separate application code from root configuration files.

---

## Target Repository Tree

```
/
├── CLAUDE.md                          # AI assistant persistent rules
├── AGENTS.md                          # Next.js 16.4 auto-generated agent rules
├── README.md                          # Project overview and setup
├── .env                               # Single local environment file (gitignored; variables listed in docs/RUNBOOK.md §2)
├── .gitignore                         # Git ignore rules
├── package.json                       # Dependencies and scripts
├── package-lock.json                  # Lockfile
├── next.config.ts                     # Next.js configuration
├── tsconfig.json                      # TypeScript configuration
├── eslint.config.mjs                  # ESLint configuration
│
├── prisma/                            # Database schema and migrations
│   ├── schema.prisma                  # Prisma schema (if approved in Prompt 0)
│   ├── migrations/                    # Versioned, append-only migrations
│   └── seed.ts                        # Dev/test seed data only (clearly identified)
│
├── public/                            # Deliberately public static assets ONLY
│   ├── brand/                         # Approved brand assets (logo, favicon)
│   │   └── (gara-logo.svg)           # Expected: supplied by product owner
│   └── icons/                         # App icons, OG images
│
├── src/
│   ├── app/                           # Next.js App Router — routes, layouts, pages
│   │   ├── layout.tsx                 # Root layout (html, body, providers, fonts)
│   │   ├── globals.css                # Global styles / Tailwind imports
│   │   ├── loading.tsx                # Root loading skeleton
│   │   ├── error.tsx                  # Root error boundary
│   │   ├── not-found.tsx              # Root 404 page
│   │   ├── global-error.tsx           # Unrecoverable error fallback
│   │   │
│   │   ├── (marketing)/              # Public-facing pages (no auth required)
│   │   │   ├── layout.tsx            # Marketing layout (navbar, footer)
│   │   │   ├── page.tsx              # Landing page  →  /
│   │   │   ├── about/page.tsx        # About page    →  /about
│   │   │   ├── careers/page.tsx      # Careers/openings list  →  /careers
│   │   │   └── verify/[code]/page.tsx # Public cert verification → /verify/[code]
│   │   │
│   │   ├── (auth)/                   # Authentication pages
│   │   │   ├── layout.tsx            # Minimal centered auth layout
│   │   │   ├── login/page.tsx        # Login  →  /login
│   │   │   ├── register/page.tsx     # Registration  →  /register
│   │   │   ├── forgot-password/page.tsx
│   │   │   └── reset-password/page.tsx
│   │   │
│   │   ├── (candidate)/              # Candidate portal (authenticated candidates)
│   │   │   ├── layout.tsx            # Candidate dashboard layout
│   │   │   ├── dashboard/page.tsx    # Candidate home  →  /dashboard
│   │   │   ├── openings/             # Browse & view openings
│   │   │   │   ├── page.tsx          # Openings list  →  /openings
│   │   │   │   └── [id]/page.tsx     # Opening detail  →  /openings/[id]
│   │   │   ├── applications/         # Candidate's own applications
│   │   │   │   ├── page.tsx          # My applications  →  /applications
│   │   │   │   └── [id]/page.tsx     # Application detail  →  /applications/[id]
│   │   │   └── profile/page.tsx      # Candidate profile  →  /profile
│   │   │
│   │   ├── (recruitment)/            # Recruitment workspace (staff/HR)
│   │   │   ├── layout.tsx            # Recruitment admin layout
│   │   │   ├── dashboard/page.tsx    # Recruitment home
│   │   │   ├── openings/             # Manage openings
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx      # Opening detail + applicants
│   │   │   │       └── edit/page.tsx
│   │   │   ├── applications/         # Review applications
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── interviews/           # Interview scheduling & feedback
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   └── candidates/           # Candidate search / archive
│   │   │       └── page.tsx
│   │   │
│   │   ├── (intern)/                 # Internship portal (interns + mentors)
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── tasks/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── progress/page.tsx
│   │   │   ├── evaluation/page.tsx
│   │   │   └── certificate/page.tsx
│   │   │
│   │   ├── (hrms)/                   # HRMS (employees, HR, management)
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── employees/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── attendance/page.tsx
│   │   │   ├── leave/
│   │   │   │   ├── page.tsx
│   │   │   │   └── requests/page.tsx
│   │   │   ├── payroll/page.tsx      # POLICY-GATED: blocked until OD-007
│   │   │   └── settings/page.tsx
│   │   │
│   │   └── api/                      # Route Handlers (REST-style API endpoints)
│   │       ├── auth/                 # Auth callbacks (OAuth, etc.)
│   │       ├── webhooks/             # Inbound webhooks
│   │       └── verify/[code]/route.ts # Certificate verification API
│   │
│   ├── features/                     # Domain modules — business logic lives here
│   │   ├── auth/                     # Authentication & session management
│   │   │   ├── components/           # Auth-specific UI (login form, etc.)
│   │   │   ├── actions/              # Server Actions (login, register, etc.)
│   │   │   ├── services/             # Auth business logic
│   │   │   ├── schemas/              # Zod validation schemas
│   │   │   └── types.ts              # Auth domain types
│   │   │
│   │   ├── openings/                 # Job/internship openings
│   │   │   ├── components/
│   │   │   ├── actions/
│   │   │   ├── services/
│   │   │   ├── queries/              # Data fetching (server-side)
│   │   │   ├── schemas/
│   │   │   └── types.ts
│   │   │
│   │   ├── applications/             # Candidate applications
│   │   │   ├── components/
│   │   │   ├── actions/
│   │   │   ├── services/
│   │   │   ├── queries/
│   │   │   ├── schemas/
│   │   │   └── types.ts
│   │   │
│   │   ├── application-forms/        # Dynamic form builder & versioning
│   │   │   ├── components/
│   │   │   ├── services/
│   │   │   ├── schemas/
│   │   │   └── types.ts
│   │   │
│   │   ├── recruitment/              # Recruitment pipeline & workflow
│   │   │   ├── components/
│   │   │   ├── actions/
│   │   │   ├── services/
│   │   │   └── types.ts
│   │   │
│   │   ├── interviews/               # Interview scheduling & feedback
│   │   │   ├── components/
│   │   │   ├── actions/
│   │   │   ├── services/
│   │   │   └── types.ts
│   │   │
│   │   ├── internship-evaluation/    # 7-working-day evaluation (PARTIALLY BLOCKED)
│   │   │   ├── components/
│   │   │   ├── actions/
│   │   │   ├── services/
│   │   │   └── types.ts
│   │   │
│   │   ├── onboarding/               # Intern/employee onboarding
│   │   │   ├── components/
│   │   │   ├── actions/
│   │   │   ├── services/
│   │   │   └── types.ts
│   │   │
│   │   ├── intern-tasks/             # Intern task assignment & tracking
│   │   │   ├── components/
│   │   │   ├── actions/
│   │   │   ├── services/
│   │   │   └── types.ts
│   │   │
│   │   ├── progress/                 # Progress monitoring (configurable)
│   │   │   ├── components/
│   │   │   ├── actions/
│   │   │   ├── services/
│   │   │   └── types.ts
│   │   │
│   │   ├── certificates/             # Certificate generation & verification
│   │   │   ├── components/
│   │   │   ├── actions/
│   │   │   ├── services/
│   │   │   └── types.ts
│   │   │
│   │   ├── employees/                # Employee records management
│   │   │   ├── components/
│   │   │   ├── actions/
│   │   │   ├── services/
│   │   │   └── types.ts
│   │   │
│   │   ├── attendance/               # Attendance tracking (POLICY-GATED: OD-005)
│   │   │   ├── components/
│   │   │   ├── services/
│   │   │   └── types.ts
│   │   │
│   │   ├── leave/                    # Leave management (POLICY-GATED: OD-006)
│   │   │   ├── components/
│   │   │   ├── services/
│   │   │   └── types.ts
│   │   │
│   │   ├── payroll/                  # Payroll processing (POLICY-GATED: OD-007)
│   │   │   ├── components/
│   │   │   ├── services/
│   │   │   └── types.ts
│   │   │
│   │   ├── notifications/            # Email/in-app notification orchestration
│   │   │   ├── services/
│   │   │   ├── templates/
│   │   │   └── types.ts
│   │   │
│   │   ├── chatbot/                  # Restricted chatbot (PARTIALLY BLOCKED: OD-012)
│   │   │   ├── components/
│   │   │   ├── services/
│   │   │   └── types.ts
│   │   │
│   │   ├── reports/                  # Reporting & analytics
│   │   │   ├── components/
│   │   │   ├── queries/
│   │   │   └── types.ts
│   │   │
│   │   └── audit/                    # Audit trail & activity logs
│   │       ├── services/
│   │       └── types.ts
│   │
│   ├── components/                   # Shared UI components
│   │   ├── ui/                       # Design system primitives (Button, Input, Card, etc.)
│   │   ├── shared/                   # Composed application components (DataTable, etc.)
│   │   ├── navigation/              # Navbar, sidebar, breadcrumbs
│   │   └── feedback/                # Toast, alerts, confirmation dialogs, empty states
│   │
│   ├── infrastructure/              # External provider adapters
│   │   ├── email/                   # Nodemailer adapter + provider abstraction
│   │   │   ├── email-adapter.ts     # Interface
│   │   │   └── nodemailer.ts        # Nodemailer implementation
│   │   ├── storage/                 # File storage adapter (S3-compatible, etc.)
│   │   │   ├── storage-adapter.ts
│   │   │   └── (provider).ts
│   │   ├── ai/                      # AI provider adapter (chatbot, etc.)
│   │   │   ├── ai-adapter.ts
│   │   │   └── (provider).ts
│   │   ├── pdf/                     # PDF generation adapter
│   │   │   ├── pdf-adapter.ts
│   │   │   └── (provider).ts
│   │   └── jobs/                    # Background job/queue adapter
│   │       ├── job-adapter.ts
│   │       └── (provider).ts
│   │
│   ├── lib/                         # Cross-cutting server-side utilities
│   │   ├── db.ts                    # Database client singleton
│   │   ├── env.ts                   # Environment variable validation (Zod)
│   │   ├── auth/                    # Auth helpers (session, tokens, guards)
│   │   │   ├── session.ts
│   │   │   └── guards.ts
│   │   ├── security/                # CSRF, rate limiting, input sanitization
│   │   ├── validation/              # Shared validation utilities
│   │   ├── errors/                  # Error classes and safe error responses
│   │   ├── logging/                 # Structured logging
│   │   └── utils/                   # General-purpose helpers
│   │
│   ├── config/                      # Application configuration constants
│   │   ├── navigation.ts            # Route definitions, nav items
│   │   ├── roles.ts                 # Role/permission constants
│   │   └── site.ts                  # Site metadata, branding config
│   │
│   ├── styles/                      # Design tokens, theme configuration
│   │   └── tokens.css               # CSS custom properties for theming
│   │
│   └── types/                       # Shared TypeScript type definitions
│       ├── database.ts              # Generated Prisma types re-exports
│       └── common.ts                # Shared utility types
│
├── tests/                           # All automated tests
│   ├── unit/                        # Unit tests (pure functions, services, utils)
│   ├── integration/                 # DB-backed flows, auth, API routes
│   ├── e2e/                         # Browser-based end-to-end tests
│   ├── fixtures/                    # Shared test data
│   └── helpers/                     # Test utilities, factories, custom matchers
│
├── scripts/                         # Development & operational scripts
│   └── (setup, seed, etc.)
│
├── docs/                            # All documentation
│   ├── PROJECT_BASELINE.md          # Product source of truth (owner-supplied)
│   ├── PROJECT_RULES.md             # Engineering standards
│   ├── FOLDER_STRUCTURE.md          # This file
│   ├── ARCHITECTURE.md              # System architecture
│   ├── SECURITY.md                  # Security policies
│   ├── TESTING.md                   # Test strategy
│   ├── DATA_MODEL.md                # Database schema docs
│   ├── OPEN_DECISIONS.md            # Unresolved business decisions
│   ├── RUNBOOK.md                   # Operational procedures
│   ├── decisions/                   # Architecture Decision Records
│   │   └── ADR-0001-modular-monolith.md
│   └── prompts/                     # Saved prompt templates
│
└── .github/
    └── workflows/                   # CI/CD pipeline definitions
```

---

## Folder Responsibilities

### `src/app/` — Routing Layer

The App Router directory is **purely for routing orchestration**. Each file (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`) should be thin — importing and composing feature-level components, calling feature services, and applying authorization guards.

**Rules:**
- No business logic in route files.
- No direct database queries in pages — use feature `queries/` or `actions/`.
- Route groups `(marketing)`, `(auth)`, `(candidate)`, `(recruitment)`, `(intern)`, `(hrms)` organize by user persona and auth requirements. They do NOT appear in URLs.

### `src/features/<domain>/` — Domain Modules

Each domain module encapsulates its own business logic. A module should only contain the subfolders it actually needs — do not create empty directories.

**Standard subfolders (create as needed):**
| Subfolder | Purpose |
|---|---|
| `components/` | Domain-specific React components |
| `actions/` | Server Actions (form submissions, mutations) |
| `services/` | Business logic functions (server-only) |
| `queries/` | Data fetching functions (server-only) |
| `schemas/` | Zod validation schemas |
| `templates/` | Email/notification templates |
| `types.ts` | Domain-specific TypeScript types |

**Import rules:**
- Features may import from `lib/`, `components/ui/`, `components/shared/`, `infrastructure/`, `config/`, `types/`.
- Features must NOT import from other features' `services/` or `actions/` directly. Shared logic goes to `lib/` or a clearly documented shared service.
- Features must NOT import from `src/app/`.

### `src/components/` — Shared UI

| Folder | Purpose |
|---|---|
| `ui/` | Design system primitives: Button, Input, Select, Card, Badge, Dialog, etc. Accessible, themeable, no business logic. |
| `shared/` | Composed components used across features: DataTable, FileUpload, StatusBadge, Pagination, etc. |
| `navigation/` | Navbar, Sidebar, Breadcrumbs, MobileNav — role-aware, responsive. |
| `feedback/` | Toast notifications, alert banners, confirmation dialogs, empty states, error boundaries. |

### `src/infrastructure/` — Provider Adapters

Each subdirectory defines an **interface** (adapter contract) and one or more **implementations**. Business modules depend on the interface, never on provider SDKs directly.

This allows swapping providers (e.g., SendGrid → AWS SES) without modifying business logic.

### `src/lib/` — Cross-Cutting Utilities

Server-only utilities shared across all features. These should be marked with `import 'server-only'` where appropriate to prevent client bundle inclusion.

### `src/config/` — Application Constants

Centralized configuration values: route paths, role definitions, site metadata. Not environment variables (those go in `lib/env.ts`).

### `prisma/` — Database

Schema, versioned migrations (append-only), and development seed data. Seed data must be clearly identified as non-production.

### `tests/` — Automated Tests

Separate directories by test type. Each mirrors the source structure it tests:
- `unit/features/auth/` tests `src/features/auth/services/`
- `integration/` tests database-backed flows
- `e2e/` tests browser journeys at realistic viewports

### `public/` — Public Assets Only

**CRITICAL:** Only deliberately public assets belong here. Never place:
- Resumes, cover letters, or candidate documents
- Employee records, payslips, or ID documents
- Offer letters or internal evaluation documents
- Private certificates or internal reports

---

## Route Plan

### URL Mapping (No Collisions)

| Route Group | URL Path | Auth Required | Role |
|---|---|---|---|
| `(marketing)` | `/` | No | Public |
| `(marketing)` | `/about` | No | Public |
| `(marketing)` | `/careers` | No | Public |
| `(marketing)` | `/verify/[code]` | No | Public |
| `(auth)` | `/login` | No | Guest only |
| `(auth)` | `/register` | No | Guest only |
| `(auth)` | `/forgot-password` | No | Guest only |
| `(auth)` | `/reset-password` | No | Guest only |
| `(candidate)` | `/dashboard` | Yes | Candidate |
| `(candidate)` | `/openings` | Yes | Candidate |
| `(candidate)` | `/openings/[id]` | Yes | Candidate |
| `(candidate)` | `/applications` | Yes | Candidate |
| `(candidate)` | `/applications/[id]` | Yes | Candidate |
| `(candidate)` | `/profile` | Yes | Candidate |
| `(recruitment)` | `/recruitment/dashboard` | Yes | Staff/HR |
| `(recruitment)` | `/recruitment/openings` | Yes | Staff/HR |
| `(recruitment)` | `/recruitment/openings/new` | Yes | Staff/HR |
| `(recruitment)` | `/recruitment/openings/[id]` | Yes | Staff/HR |
| `(recruitment)` | `/recruitment/applications` | Yes | Staff/HR |
| `(recruitment)` | `/recruitment/applications/[id]` | Yes | Staff/HR |
| `(recruitment)` | `/recruitment/interviews` | Yes | Staff/HR |
| `(recruitment)` | `/recruitment/candidates` | Yes | Staff/HR |
| `(intern)` | `/intern/dashboard` | Yes | Intern/Mentor |
| `(intern)` | `/intern/tasks` | Yes | Intern/Mentor |
| `(intern)` | `/intern/progress` | Yes | Intern/Mentor |
| `(intern)` | `/intern/evaluation` | Yes | Intern/Mentor |
| `(intern)` | `/intern/certificate` | Yes | Intern |
| `(hrms)` | `/hrms/dashboard` | Yes | Employee/HR |
| `(hrms)` | `/hrms/employees` | Yes | HR/Manager |
| `(hrms)` | `/hrms/employees/[id]` | Yes | HR/Manager |
| `(hrms)` | `/hrms/attendance` | Yes | Employee/HR |
| `(hrms)` | `/hrms/leave` | Yes | Employee/HR |
| `(hrms)` | `/hrms/payroll` | Yes | HR/Admin |
| `(hrms)` | `/hrms/settings` | Yes | Admin |

### Collision Avoidance Notes

- **Candidate** routes (`/dashboard`, `/openings`, `/applications`, `/profile`) are unprefixed for a cleaner candidate experience.
- **Staff** routes use `/recruitment/` prefix to avoid collision with candidate routes.
- **HRMS** routes use `/hrms/` prefix.
- **Intern** routes use `/intern/` prefix.
- The `(marketing)` group owns `/` (root) and other public pages.
- The `(auth)` group owns `/login`, `/register`, etc.
- No two route groups produce the same URL path.

---

## Import Direction (Dependency Rules)

```
src/app/        →  imports from  →  src/features/, src/components/, src/lib/, src/config/
src/features/   →  imports from  →  src/lib/, src/components/ui, src/infrastructure/, src/config/, src/types/
src/components/ →  imports from  →  src/lib/, src/config/, src/types/
src/lib/        →  imports from  →  src/infrastructure/ (for DB, adapters), src/config/, src/types/
src/infrastructure/ → imports from → external packages, src/config/, src/types/
```

**Never:**
- `src/features/` → `src/app/`
- `src/lib/` → `src/features/`
- `src/components/ui/` → `src/features/`
- `src/infrastructure/` → `src/features/`
- Any client bundle → `src/lib/db.ts`, `src/lib/auth/session.ts`, or server secrets

---

## Where Does a New Feature Belong?

| Scenario | Location |
|---|---|
| New business domain (e.g., performance reviews) | `src/features/performance-reviews/` with needed subfolders |
| New page for an existing domain | `src/app/(group)/path/page.tsx` — thin, imports from feature |
| New reusable UI primitive | `src/components/ui/` |
| New reusable composed component | `src/components/shared/` |
| New external provider integration | `src/infrastructure/<provider>/` with adapter interface |
| New cross-cutting utility | `src/lib/<category>/` |
| New shared type | `src/types/` |
| New database table | `prisma/schema.prisma` + migration |
| New configuration constant | `src/config/` |
| New architecture decision | `docs/decisions/ADR-NNNN-title.md` |

---

## Migration Note: Current `app/` → `src/app/`

The current repository has `app/` at the project root (default `create-next-app` scaffold). The target structure moves it to `src/app/`. This migration should happen during Prompt 1 (project initialization) by:

1. Creating the `src/` directory.
2. Moving `app/` into `src/app/`.
3. Updating `tsconfig.json` path alias from `"@/*": ["./*"]` to `"@/*": ["./src/*"]`.
4. Verifying the build succeeds after the move.

This is a standard Next.js convention and does not require framework changes.
