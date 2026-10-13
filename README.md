# GARA Innovation — Recruitment, Internship Lifecycle & HRMS Platform

Enterprise full-stack recruitment, internship evaluation, and human resource management platform for GARA Innovation.

---

## Technical Stack

- **Framework:** [Next.js 16.4.0 (App Router)](https://nextjs.org/) + React 19
- **Architecture:** Modular Monolith under `src/` with isolated domain feature modules
- **Database:** PostgreSQL + [Prisma ORM 7](https://www.prisma.io/) with `@prisma/adapter-pg`
- **Authentication:** [Better Auth](https://www.better-auth.com/) (Email/Password + Google OAuth)
- **Styling:** Tailwind CSS v4 + GARA Design Tokens (restrained palette, zero gradients)
- **Icons:** [Lucide React](https://lucide.dev/)
- **Validation:** [Zod](https://zod.dev/) + React Hook Form
- **Testing:** [Vitest](https://vitest.dev/) (Unit/Integration) + [Playwright](https://playwright.dev/) (E2E)

---

## Quick Start for Local Development

### 1. Prerequisites
- **Node.js:** v20+ or v24+
- **PostgreSQL:** Running local instance or hosted database

### 2. Configure Environment
```bash
cp .env.example .env.local
# Update .env.local with your database connection string and Better Auth secret
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Database Setup & Prisma Client
```bash
# Generate Prisma Client
npx prisma generate

# Apply migrations (when PostgreSQL is connected)
npx prisma migrate dev
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

# Automated unit & integration tests
npm test

# Production build
npm run build
```

---

## Documentation Suite

| Document | Purpose |
|---|---|
| [`CLAUDE.md`](file:///Users/ashwanikushwaha/intern-hiring/CLAUDE.md) | Persistent rules and non-negotiable guidelines for AI assistants |
| [`docs/PROJECT_BASELINE.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/PROJECT_BASELINE.md) | Product source of truth and master phased prompt pack |
| [`docs/PROJECT_RULES.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/PROJECT_RULES.md) | Engineering standards and developer rules (Sections A–K) |
| [`docs/FOLDER_STRUCTURE.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/FOLDER_STRUCTURE.md) | Target directory blueprint and dependency rules |
| [`docs/ARCHITECTURE.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/ARCHITECTURE.md) | System layers, domain boundaries, and provider adapters |
| [`docs/DATA_MODEL.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/DATA_MODEL.md) | Relational database schema outline and state machines |
| [`docs/SECURITY.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/SECURITY.md) | Security policy, RBAC hierarchy, and document privacy |
| [`docs/TESTING.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/TESTING.md) | Testing strategy across unit, integration, and E2E layers |
| [`docs/OPEN_DECISIONS.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/OPEN_DECISIONS.md) | Active policy questions and unresolved blockers (OD-001–OD-020) |
| [`docs/RUNBOOK.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/RUNBOOK.md) | Deployment runbook, secret hygiene, and incident handling |
