# ADR-0001: Modular Monolith Architecture

**Status:** Proposed (pending Prompt 0 validation)
**Date:** 2026-10-12
**Decision Makers:** Product Owner, Engineering Lead

---

## Context

GARA Innovation is building a Recruitment, Internship Lifecycle, and HRMS platform. The platform spans multiple business domains: candidate management, recruitment pipeline, internship evaluation, employee records, attendance, leave, payroll, certificate verification, and a restricted chatbot.

We need to choose an application architecture that:
1. Supports a small team building multiple domains rapidly.
2. Keeps business logic cleanly separated between domains.
3. Allows future extraction of domains into independent services if needed.
4. Minimizes operational overhead during the initial product phase.
5. Works well with the Next.js App Router full-stack model.

---

## Decision

**Adopt a modular monolith architecture:** one Next.js application with clearly separated business domain modules, shared infrastructure adapters, and explicit dependency rules between modules.

### Structure

- **`src/app/`** — Thin routing layer (pages, layouts, route handlers). Orchestrates features.
- **`src/features/<domain>/`** — Each business domain encapsulates its own components, actions, services, queries, schemas, and types.
- **`src/lib/`** — Cross-cutting server utilities (auth, DB, validation, logging, errors).
- **`src/infrastructure/`** — Provider adapters with stable interfaces (email, storage, AI, PDF, jobs).
- **`src/components/`** — Shared UI primitives and composed components.
- **`prisma/`** — Single database schema with versioned migrations.

### Module Rules

- Features import from `lib/`, `components/`, `infrastructure/`, `config/`, and `types/`.
- Features do NOT import from other features' internal services directly. Shared logic goes to `lib/`.
- No circular dependencies between feature modules.
- Side effects (email notifications, audit logging) are explicit calls, not implicit hooks.

---

## Alternatives Considered

### 1. Microservices from Day One

**Rejected because:**
- The team is small. Managing separate deployments, service discovery, API gateways, distributed transactions, and inter-service auth is unnecessary overhead at this stage.
- Domain boundaries are not yet stable — many business rules are still undefined (see `OPEN_DECISIONS.md`). Premature service splitting would lead to expensive boundary changes.
- Next.js Server Components and Server Actions provide natural server/client separation within a single deployment.

### 2. Monolith without Module Boundaries (Traditional "Ball of Mud")

**Rejected because:**
- Without explicit module boundaries, code becomes tangled as features grow. Authentication logic bleeds into UI, database queries appear in components, and provider SDKs get imported everywhere.
- This makes testing, refactoring, and future extraction dramatically harder.
- The modular monolith provides most of the monolith's operational simplicity with much of the microservices' organizational clarity.

### 3. Backend-for-Frontend (BFF) + Separate API Server

**Rejected because:**
- Next.js App Router already provides a full-stack model with Server Components and Server Actions. Adding a separate API server introduces unnecessary deployment complexity and latency.
- A separate API server makes sense if the platform needs to serve mobile apps or third-party integrations, but those are not current requirements.
- If needed later, specific API routes can be extracted without redesigning the entire architecture.

---

## Consequences

### Positive

- **Low operational overhead.** Single deployment, single database, simple CI/CD.
- **Fast development.** Shared types, direct function calls between modules, no network serialization overhead.
- **Clean boundaries.** Feature modules enforce separation of concerns without distributed-system complexity.
- **Testable.** Unit tests mock at module boundaries. Integration tests use a real database. No inter-service mocking.
- **Flexible future path.** If a domain (e.g., payroll, certificate verification) needs independent scaling, extract it behind an API. The adapter pattern makes this incremental.

### Negative

- **Shared database.** All modules share one PostgreSQL database. Schema changes require coordination. Mitigated by: Prisma schema with clear table ownership documented per module.
- **Deployment coupling.** A bug in one module can block deployment of all modules. Mitigated by: good test coverage, feature flags, and staged rollouts.
- **Scaling limits.** If one module needs dramatically different compute (e.g., CPU-intensive PDF generation), it cannot be scaled independently. Mitigated by: offloading heavy work to background jobs or extracting that specific concern.

### Risks

- **Discipline required.** Module boundaries are enforced by convention and code review, not by network separation. Without discipline, the monolith degrades into a ball of mud. Mitigated by: documented import rules, lint rules (if available), and code review practices.
- **Single point of failure.** If the Next.js server goes down, everything is down. Mitigated by: standard high-availability deployment (multiple replicas behind a load balancer).

---

## Validation

This ADR must be validated during Prompt 0:
- Confirm that the proposed module structure is compatible with Next.js 16.4 conventions.
- Confirm that the `src/` directory convention works with the existing `tsconfig.json` path aliases.
- Confirm that selected ORM, auth library, and test framework are compatible with this architecture.
- Review against the product baseline (when supplied) for any requirements that would favor a different architecture.
