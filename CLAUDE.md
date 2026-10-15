# CLAUDE.md — GARA Innovation Engineering Rules

> This file is read by AI coding assistants at the start of every session.
> Do NOT delete or silently override these rules.

## Before Every Task

1. Read `docs/PROJECT_BASELINE.md` — the confirmed product source of truth.
2. Read `docs/PROJECT_RULES.md` — detailed engineering standards.
3. Read `docs/OPEN_DECISIONS.md` — unresolved business rules that must NOT be invented.
4. Confirm which phase/prompt has been explicitly approved by the product owner.
5. Work ONLY within the approved phase scope.

## Core Principles

- **Never invent business rules.** Recruitment, HR, attendance, leave, payroll, evaluation, certificate, retention, and approval rules must come from the product owner. If a rule is missing, record it in `docs/OPEN_DECISIONS.md` and continue with safe independent work.
- **Distinguish states clearly.** "Implemented" ≠ "tested" ≠ "configured" ≠ "deployed". Never claim something works without evidence.
- **No fake data in production contexts.** Development seed data must be clearly identified, deterministic, and restricted to local/test environments.
- **Preserve Git working tree.** Inspect `git status` before modifying a non-empty repository. Never run destructive commands without explicit approval.

## Architecture

- **Modular monolith** — one Next.js codebase with clear domain boundaries. See `docs/ARCHITECTURE.md`.
- **Folder structure** — see `docs/FOLDER_STRUCTURE.md` for the target blueprint.
- **src/ directory** — all application code lives under `src/` with `app/`, `features/`, `components/`, `lib/`, `infrastructure/`, `config/`, `styles/`, and `types/`.
- **Route groups** separate public, auth, candidate, recruitment, intern, and HRMS concerns.
- **Feature modules** in `src/features/<domain>/` own domain-specific components, schemas, actions, services, queries, and types.
- **Infrastructure adapters** in `src/infrastructure/` isolate email, storage, AI, PDF, and job processing providers.

## Code Standards

- TypeScript strict mode. No `any`, no `@ts-ignore`, no disabled lint rules without narrow justification.
- Server Components by default. Client Components only when interaction/state/browser APIs require them.
- Never import DB clients, secrets, or server-only env vars into client bundles.
- Validate all untrusted data at server boundaries. Client validation is UX, not security.
- Every Server Action and Route Handler: authenticate → authorize → validate → enforce transitions → return safe results.
- Accessible semantic HTML, keyboard navigation, visible focus states, meaningful error messages.

## Security

- Authentication confirms identity; authorization confirms permission for the specific record/action.
- Public signup never grants staff/HR/admin roles.
- Private documents (resumes, payslips, ID docs) never in `public/` or permanent public URLs.
- Credentials from validated server env vars. Never commit `.env` files or secrets.
- Rate-limit login, verification, password recovery, public forms, uploads, and chatbot endpoints.

## Data Integrity

- PostgreSQL constraints, foreign keys, unique constraints, and indexes used intentionally.
- Schema changes via versioned migrations only. Never edit applied migrations.
- Transactions for multi-record operations that must succeed or fail together.
- Explicit status transitions with server-side validation. Reject invalid transitions.
- History tracking for application stages, interviews, reviews, approvals, and certificates.

## What NOT To Do

- Do not invent payroll/tax/attendance/leave/evaluation/retention/certificate/approval rules.
- Do not add unrequested social-login providers (only email/password + Google initially).
- Do not copy TaskMaster UI, schema, or workflows.
- Do not put business logic in Client Components.
- Do not expose secrets, private records, or detailed stack traces.
- Do not report success without evidence.
- Do not start work on unapproved phases.

## Key Documentation

| Document | Purpose |
|---|---|
| `docs/PROJECT_BASELINE.md` | Confirmed product requirements (source of truth) |
| `docs/PROJECT_RULES.md` | Detailed engineering rules |
| `docs/ARCHITECTURE.md` | System architecture and boundaries |
| `docs/FOLDER_STRUCTURE.md` | Target directory tree and conventions |
| `docs/SECURITY.md` | Security policies and threat model |
| `docs/TESTING.md` | Test strategy and quality gates |
| `docs/DATA_MODEL.md` | Database schema documentation |
| `docs/OPEN_DECISIONS.md` | Unresolved business decisions |
| `docs/RUNBOOK.md` | Operational procedures |
| `docs/decisions/` | Architecture Decision Records |
