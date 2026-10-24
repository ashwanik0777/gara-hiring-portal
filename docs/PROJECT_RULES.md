# Project Rules — GARA Innovation Platform

> **Status:** Persistent engineering rules. Every developer and AI assistant must follow these standards.

---

## A. Source of Truth and Decision Making

1. **`docs/PROJECT_BASELINE.md`** defines confirmed product requirements. It is the primary source of truth.
2. **`docs/OPEN_DECISIONS.md`** tracks anything not yet approved by the product owner. Items here must NOT be implemented.
3. Technical decisions affecting structure must be documented as ADRs in `docs/decisions/`.
4. Never silently alter an approved decision. Identify the impact and request approval.
5. Distinguish clearly: **"implemented"** ≠ **"tested"** ≠ **"configured"** ≠ **"deployed"**. Never use these interchangeably.
6. If a business rule is missing:
   - Record it in `docs/OPEN_DECISIONS.md` with ID, question, impact, affected modules, safe work, and blocked work.
   - Continue with safe, independent work.
   - Do NOT implement the undefined rule.

---

## B. TypeScript and Code Quality

1. **TypeScript strict mode** — always enabled. Use explicit domain types.
2. **Banned patterns** (unless narrowly justified with a code comment):
   - `any` type
   - `@ts-ignore` / `@ts-expect-error`
   - Disabled lint rules
   - Unchecked type assertions (`as unknown as X`)
   - Broad catch-and-ignore blocks (`catch (e) {}`)
3. Prefer small, readable, single-purpose functions and components.
4. Use consistent, descriptive naming. Avoid cryptic abbreviations.
5. Do not duplicate constants, status strings, or business rules between frontend and backend. Define once, import everywhere.
6. Separate concerns: UI rendering, domain logic, persistence, and provider integration belong in different layers.
7. Validate all untrusted data at server boundaries. Client-side validation is UX, not security.
8. Use accessible semantic HTML: proper labels, keyboard navigation, visible focus states, ARIA attributes where needed, meaningful error messages.

---

## C. Next.js Server/Client Boundaries

1. **Server Components are the default** for data-driven pages. Use Client Components (`'use client'`) only where interaction, state, or browser APIs require them.
2. Mark server-only modules explicitly (using `import 'server-only'` where supported).
3. **Never import** into client bundles:
   - Database clients (`prisma`, `pg`)
   - Secrets or server-only environment variables
   - Privileged services or internal helpers
4. Keep `page.tsx`, layouts, and route handlers **thin**. They orchestrate — invoking feature services and actions — not implementing complex workflows.
5. **Every Server Action and Route Handler is an externally-triggerable boundary.** Each must:
   - Authenticate the session
   - Authorize the specific operation
   - Validate input (Zod schema)
   - Enforce valid state transitions
   - Return safe, typed results
6. Never treat middleware redirects or hidden UI elements as authorization. Verify permission close to the data operation.

---

## D. Data and Workflow Integrity

1. Use PostgreSQL constraints: foreign keys, unique constraints, check constraints, and indexes — intentionally, not decoratively.
2. Schema changes go through **versioned migrations**. Never edit an applied migration.
3. Use **transactions** for multi-record operations that must succeed or fail atomically.
4. Prevent duplicate submissions using idempotency keys and unique constraints where relevant.
5. Use **explicit status transitions** validated server-side. Reject invalid transitions with clear errors.
6. **Maintain history** for: application stages, interviews, reviews, approvals, offers, evaluations, and certificates.
7. **Version dynamic form definitions.** A form edit must not silently reinterpret earlier applications submitted against the old version.
8. Preserve historical data per the approved retention policy. **Archive ≠ deletion.**
9. Use JSON/JSONB only for genuinely dynamic/versioned data (form definitions, form responses, configuration snapshots). Do not dump relational data into JSON blobs.

---

## E. Authentication and Authorization

1. **Authentication** confirms identity. **Authorization** confirms the specific permission for the requested record/action. They are distinct concerns.
2. Define and document a **role/permission matrix**. Test both permitted and forbidden access.
3. **Public signup** creates `CANDIDATE` role only. Staff, HR, interviewer, mentor, manager, and admin roles require explicit admin assignment.
4. Enforce **record-level ownership/scope**: candidates see only their own applications; employees see only their own records; interns see only their own tasks/evaluation — unless an approved role grants broader access.
5. Use **secure cookie/session defaults**: `httpOnly`, `secure`, `sameSite`, documented expiry and revocation.
6. Handle **OAuth callbacks** and account linking deliberately. A Google login must not automatically grant company privileges.
7. **Rate-limit** login, verification, password recovery, public forms, file uploads, and chatbot endpoints.

---

## F. Privacy and Files

1. Treat as confidential: resumes, interview notes, phone/email, identity documents, employee records, attendance, leave, payroll, salary information.
2. Collect only approved fields. Enforce minimum necessary access per role.
3. **Private documents never in `public/`** or exposed through permanent public URLs.
4. Use an approved private storage provider with:
   - Random/non-guessable object keys
   - File size and MIME type validation
   - Time-limited signed URLs after authorization check
5. **Do not log:** passwords, access tokens, OTPs, full documents, or unnecessary personal data.
6. Define retention and anonymization procedures before handling production data (see OD-011).
7. Public certificate verification returns **only approved minimum fields** — never internal evaluations, scores, or personal documents.

---

## G. External Providers and Reliability

1. **Adapter pattern** for all external services (email, storage, AI, PDF, jobs). Business code imports the interface, not the provider SDK.
2. Credentials from **validated server environment variables**, kept in a single gitignored `.env` (no `.env.example`, product-owner decision 2026-10-24). The variable reference is `docs/RUNBOOK.md` section 2.
3. **Never commit** `.env` files, credentials, private keys, or production data.
4. Use a **durable queue/outbox** for important async notifications. No process-local `setTimeout`/`setInterval` for production-critical jobs.
5. Record notification attempts and failures. Retries must not duplicate critical communications.
6. **External service downtime must not corrupt database state.** Use transactions; decouple side effects.
7. SMS is optional — never a core dependency.
8. Chatbot AI has a restricted, documented fallback for when the provider is unavailable.
9. Before selecting any service, verify: stable API, quotas, commercial-use terms, data location/retention, migration path. Never assume a free tier is permanent.

---

## H. UI and Design Rules

1. **Build a new GARA-specific design system.** Do not copy TaskMaster screens or generic templates.
2. **Logo handling:**
   - Use the exact approved GARA logo asset if supplied.
   - Never redraw, regenerate, recolor, replace, or alter the logo.
   - If missing, document the expected path (`public/brand/gara-logo.*`) and use a neutral placeholder.
3. **No gradients.** Soft, professional colors. Restrained shadows.
4. **Three themes:** light, dark, and system — with accessible contrast ratios.
5. **Lucide React icons** consistently. Do not mix icon libraries without approval.
6. Reuse design tokens and accessible components. Do not duplicate one-off styles.
7. **Every screen needs** (where applicable): loading state, empty state, error state, success state, unauthorized state.
8. Design and test for **mobile (375px), tablet (768px), laptop (1024px), desktop (1280px+)**.
9. Use honest status labels. Confirm destructive/irreversible actions with a dialog.
10. **Never display fake metrics as live data.**

---

## I. Testing and Release Gates

1. **Unit tests** for business rules, validators, and utilities.
2. **Integration tests** for database-backed flows, authorization, and state transitions.
3. **End-to-end tests** for critical user journeys at practical viewports.
4. **Negative tests** required: unauthorized access, cross-user access, invalid transitions, malformed input, duplicate submissions, unsafe uploads, email/job failures.
5. **Quality gate pipeline:** format → lint → typecheck → unit tests → integration tests → production build → E2E tests.
6. Do not skip or falsify tests. If a test is blocked by environment, document it honestly.
7. Do not claim a provider integration works unless tested with the relevant configuration.
8. Keep test data isolated from production.

---

## J. Working Process

1. Work in **small, reviewable changes**.
2. Before modifying a non-empty repository, **inspect Git status** and preserve user changes.
3. Do not run destructive commands without explicit approval.
4. Before each phase, **state the scope** and files likely to change.
5. After each phase, **report:**
   - Implementation summary
   - Files changed
   - Migrations created or applied
   - Commands actually run
   - Exact pass/fail results
   - Known issues and open decisions
   - Manual provider setup required
   - Next proposed step
6. **Stop at the phase boundary.** Wait for explicit product-owner approval before the next prompt.
7. If a request conflicts with the baseline, explain the conflict. Do not guess which rule wins.

---

## K. What Not To Do

- Do not scaffold or implement product code during a documentation/planning phase.
- Do not invent payroll, tax, attendance, leave, evaluation, retention, certificate, or approval rules.
- Do not add unrequested social-login providers (initial: email/password + Google only).
- Do not integrate paid services as hidden requirements or rely on free tiers as guarantees.
- Do not copy TaskMaster UI, schema, or workflows.
- Do not put business logic in Client Components.
- Do not trust client-supplied roles, status values, or financial figures.
- Do not expose secrets, private records, stack traces, or unauthorized file URLs.
- Do not create unnecessary abstractions, redundant state layers, speculative microservices, or empty placeholder files.
- Do not make unrelated refactors while implementing a bounded feature.
- Do not report success without evidence.
