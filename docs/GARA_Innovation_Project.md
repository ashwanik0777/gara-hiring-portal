# GARA Innovation — Recruitment & HRMS Platform
## Finalized Planning Baseline and Master Prompt Pack

**Document version:** 1.1 planning baseline (Enriched)  
**Date:** 12 October 2026  
**Status:** Approved direction; detailed business policies remain open  
**Product:** GARA Innovation Recruitment, Internship & HRMS Platform

> Use this document as the product source of truth. It is preserved in the repository as both `docs/GARA_Innovation_Project.md` and `docs/PROJECT_BASELINE.md`. The prompts are deliberately phased: run one phase at a time, review the report, and authorize the next phase explicitly.

---

## Repository Documentation Index

The following engineering documents establish the foundation and operational standards for this codebase:

| Document | Purpose |
|---|---|
| [`CLAUDE.md`](file:///Users/ashwanikushwaha/intern-hiring/CLAUDE.md) | Persistent agent instruction rules read before every task |
| [`docs/PROJECT_RULES.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/PROJECT_RULES.md) | Detailed engineering & code quality standards (Sections A–K) |
| [`docs/FOLDER_STRUCTURE.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/FOLDER_STRUCTURE.md) | Target directory blueprint & module import direction |
| [`docs/ARCHITECTURE.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/ARCHITECTURE.md) | Modular monolith architecture, layers, boundaries & provider adapters |
| [`docs/DATA_MODEL.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/DATA_MODEL.md) | PostgreSQL entity models, relationships & lifecycle state machines |
| [`docs/SECURITY.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/SECURITY.md) | Threat surface, RBAC, document privacy, rate limits & secret hygiene |
| [`docs/TESTING.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/TESTING.md) | Testing strategy across unit, integration & E2E layers |
| [`docs/OPEN_DECISIONS.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/OPEN_DECISIONS.md) | Active open policy questions (OD-001 through OD-020) and blockers |
| [`docs/RUNBOOK.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/RUNBOOK.md) | Operational guidelines, local setup, migrations & incident runbook |
| [`docs/decisions/ADR-0001-modular-monolith.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/decisions/ADR-0001-modular-monolith.md) | Architecture Decision Record: Modular Monolith vs Microservices |

---

## Table of Contents

- [1. Confirmed decisions — do not silently change](#1-confirmed-decisions--do-not-silently-change)
  - [Recommended initial technical direction](#recommended-initial-technical-direction)
- [2. Required product flow](#2-required-product-flow)
  - [2.1 Internship lifecycle](#21-internship-lifecycle)
  - [2.2 Full-time hiring and employee lifecycle](#22-full-time-hiring-and-employee-lifecycle)
  - [2.3 Common platform areas](#23-common-platform-areas)
- [3. Important product and security rules](#3-important-product-and-security-rules)
- [4. Critical open decisions / blockers](#4-critical-open-decisions--blockers)
  - [Safe work that can proceed before these decisions](#safe-work-that-can-proceed-before-these-decisions)
- [5. How to use these prompts](#5-how-to-use-these-prompts)
- [6. Prompt 0 — Read-only discovery and implementation plan](#6-prompt-0--read-only-discovery-and-implementation-plan)
- [7. Prompt 1 — Project initialization and engineering foundation](#7-prompt-1--project-initialization-and-engineering-foundation)
- [8. Prompt 2 — Public careers website, openings and dynamic form builder](#8-prompt-2--public-careers-website-openings-and-dynamic-form-builder)
- [9. Prompt 3 — Candidate account, application submission and tracking](#9-prompt-3--candidate-account-application-submission-and-tracking)
- [10. Prompt 4 — Screening, interview scheduling and recruitment decisions](#10-prompt-4--screening-interview-scheduling-and-recruitment-decisions)
- [11. Prompt 5 — Seven-working-day evaluation, intern onboarding and ID card](#11-prompt-5--seven-working-day-evaluation-intern-onboarding-and-id-card)
- [12. Prompt 6 — Internship tasks, configurable progress and completion certificates](#12-prompt-6--internship-tasks-configurable-progress-and-completion-certificates)
- [13. Prompt 7 — Full-time recruitment and employee core](#13-prompt-7--full-time-recruitment-and-employee-core)
- [14. Prompt 8A — Attendance module (blocked pending policy approval)](#14-prompt-8a--attendance-module-blocked-pending-policy-approval)
- [15. Prompt 8B — Leave module (blocked pending policy approval)](#15-prompt-8b--leave-module-blocked-pending-policy-approval)
- [16. Prompt 8C — Payroll module (blocked pending policy and compliance approval)](#16-prompt-8c--payroll-module-blocked-pending-policy-and-compliance-approval)
- [17. Prompt 9 — Portal-only chatbot, FAQ and reports](#17-prompt-9--portal-only-chatbot-faq-and-reports)
- [18. Prompt 10 — Production hardening and release gate](#18-prompt-10--production-hardening-and-release-gate)
- [19. Expected deliverables before production](#19-expected-deliverables-before-production)

---

# 1. Confirmed decisions — do not silently change

1. **Framework:** Next.js 16.4 or newer, using a stable release of the App Router, TypeScript, and a full-stack Next.js architecture.
2. **Database:** PostgreSQL.
3. **Authentication:** email/password and Google sign-in for the initial release. GitHub and LinkedIn are not in the initial scope.
4. **Candidate access:** candidates must create an account before applying. Email verification should be supported; exact enforcement and recovery policies must be documented before shipping.
5. **Internship evaluation:** seven **working days**, not seven calendar days. The definition of a working day and the evaluation start trigger are still open.
6. **Progress monitoring:** configurable by an authorized administrator/programme owner. Do not hard-code one universal reporting frequency.
7. **Full-time scope:** HRMS scope includes employee management, attendance, leave management and payroll requirements. Actual rules for these modules are still open; payroll/leave/attendance calculations must not be invented.
8. **Unselected candidates:** retain them as historical archived records. Do not automatically add them to a future hiring pool. Archive does not mean immediate permanent deletion.
9. **Certificate issuance:** approved completion should create a PDF certificate with a unique verification ID and QR-based verification. Eligibility rules, signatory details and reissue policy remain open.
10. **Email:** Nodemailer is the transport library. The actual SMTP/email provider must be configurable and replaceable. SMS is not a required dependency.
11. **Chatbot:** answer GARA portal/programme questions only, using approved information and authorization-checked data. It must not behave as a general-purpose chatbot.
12. **UI:** a new design made for GARA Innovation. Do not copy TaskMaster's UI, layout, visual identity or component styling.
13. **Visual system:** professional, modern, attractive, soft colors, no gradients, Lucide React icons, restrained shadows, good accessibility.
14. **Themes:** light, dark and system modes.
15. **Responsive support:** small and large mobile, tablet, laptop, desktop and large monitors.
16. **Reuse policy:** TaskMaster is only a reference for selected concepts (such as task submission/review, useful security patterns and email concepts). Do not reuse its complete application, database schema or fixed session rollover model. Inspect source code/tests before claiming any implementation is safe to reuse.
17. **External services:** prefer free tiers for development where appropriate, but do not assume their plans will remain free. Provider-specific code must be isolated. Core recruitment must continue if SMS or AI services are unavailable.

## Recommended initial technical direction

- Next.js stable release `>=16.4`, App Router, TypeScript strict mode.
- React version required by the selected stable Next.js release.
- Tailwind CSS v4 stable, Lucide React, reusable accessible UI components.
- PostgreSQL with a stable, supported ORM release.
- Prisma is the leading ORM candidate, but the initialization agent must check official release status and compatibility. Do **not** use a release candidate/preview in production without explicit approval. Prisma ORM 7 is the safe stable fallback if Prisma ORM 8 is still RC at initialization time; if a newer major is officially GA by then, evaluate it against compatibility and migration requirements.
- Better Auth is the leading authentication candidate for email/password + Google. Verify current stable docs, Next.js compatibility and PostgreSQL integration before installation; do not silently replace it with another library.
- React Hook Form + Zod are candidates for dynamic forms and validation.
- Nodemailer over configurable SMTP for email delivery.
- Private object-storage adapter for resumes and documents. A provider such as Cloudflare R2 can be evaluated, but do not make the codebase dependent on it before selection.
- A durable notification/outbox pattern for email jobs. Do not rely on an in-memory scheduler for production-critical reminders.
- Unit/integration tests plus browser end-to-end tests using a currently supported stable testing stack.
- Use an active supported Node.js LTS version compatible with all selected dependencies. Verify current version requirements before pinning.
- Target Architecture: Modular monolith under `src/` with explicit domain isolation in `src/features/` and replaceable provider adapters in `src/infrastructure/`. Full details in [`docs/ARCHITECTURE.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/ARCHITECTURE.md), [`docs/FOLDER_STRUCTURE.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/FOLDER_STRUCTURE.md), and [`docs/decisions/ADR-0001-modular-monolith.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/decisions/ADR-0001-modular-monolith.md).

These are engineering recommendations, not permission to invent HR business rules.

---

# 2. Required product flow

## 2.1 Internship lifecycle

Admin creates internship opening  
→ configures eligibility, opening details and a versioned application form  
→ publishes opening on the GARA careers website  
→ candidate creates/signs into an account  
→ candidate completes form and securely uploads required documents  
→ system creates application and unique reference number  
→ candidate receives submission confirmation and can track their own application  
→ recruiter reviews resume and answers  
→ qualified candidates are shortlisted; others receive an approved outcome notification  
→ interview is scheduled and assigned interviewer(s) record feedback  
→ authorized decision-maker records the interview decision  
→ selected candidate enters a seven-working-day supervised evaluation period  
→ progress/work is tracked according to approved programme settings  
→ authorized reviewer records the final evaluation result  
→ approved candidate enters internship onboarding and receives an official intern ID card  
→ intern uses their own dashboard for tasks, submissions, reviews and progress reports  
→ final internship evaluation and completion-eligibility checks run  
→ authorized approver confirms completion  
→ PDF certificate is generated, recorded and made verifiable via unique ID/QR  
→ historical records remain available subject to an approved retention policy.

## 2.2 Full-time hiring and employee lifecycle

Admin creates a full-time vacancy  
→ configures the relevant application form and recruitment stages  
→ candidate account and application submission  
→ screening and configured interview/assessment rounds  
→ authorized final recruitment decision  
→ offer preparation and acceptance workflow  
→ joining formalities and approved document verification  
→ employee onboarding and profile creation  
→ employee/department/manager allocation  
→ HRMS attendance, leave and payroll modules once their policies are approved  
→ ongoing employee records, reviews and offboarding/exit process where required.

Full-time recruitment must not be forced to use internship-only stages. Both workflows may share common services and configurable workflow infrastructure.

## 2.3 Common platform areas

- Public company/careers site.
- Candidate account and application tracker.
- Recruitment admin/recruiter workspace.
- Interviewer workspace.
- Internship coordinator/HR workspace.
- Mentor/supervisor workspace.
- Intern workspace.
- Employee workspace.
- Opening and dynamic form management.
- Secure file/document storage.
- Email notifications and delivery history.
- Certificate generation and public verification.
- Reports, audit logs and configuration.
- Portal-specific chatbot.
- Attendance, leave and payroll HRMS modules once policies are approved.

---

# 3. Important product and security rules

1. **No invented business logic.** If a rule is missing, write it to `docs/OPEN_DECISIONS.md`, explain why it matters, and stop that part of implementation until approved.
2. Do not expose internal notes, interviewer feedback, other candidates' records, employee files, payroll information or private documents to candidates or the chatbot.
3. Authentication is not authorization. Every protected data read/mutation must enforce server-side permissions.
4. Candidate/client inputs are untrusted. Validate on the server, limit uploads, use safe storage keys, escape email HTML and protect public endpoints against abuse.
5. No self-assignment of staff, HR, interviewer, mentor or administrator permissions. Provision privileged users through a controlled process.
6. Preserve important status transitions, approvals and history. Do not delete task/submission/review history to reset a cohort.
7. Keep public candidate-facing status messages separate from internal status notes.
8. Version application forms and relevant workflow definitions so changes do not reinterpret prior submissions silently.
9. Email failure must not undo a valid recruitment decision. Record delivery state and support safe retry without sending duplicates.
10. The chatbot may only use approved GARA portal/programme knowledge. Personalized data must be fetched server-side after permission checks; never trust the model to enforce access control.
11. Do not make SMS or any external AI provider a required dependency for the core recruitment workflow.
12. Do not put secrets in source control or client bundles. Provide `.env.example` with placeholders only.
13. Do not use fabricated production-looking metrics as if they were real. Demo/seed data must be clearly marked and development-only.
14. Every phase must finish with tests/checks, changed-file summary, migration notes, known gaps and a clear stop point. Never continue into later phases without user authorization.
15. Use the approved GARA logo asset exactly as supplied. Do not redraw, regenerate, replace, recolor or alter the logo mark. If the asset is missing from the repository, ask for it or leave a clearly documented placeholder; never invent a replacement.

---

# 4. Critical open decisions / blockers

These items do **not** prevent an initial repository scaffold, but they block final implementation of the corresponding business workflow. Claude must not make these decisions on behalf of GARA Innovation.

| ID | Open decision | Blocks / affects |
|---|---|---|
| D-01 | What starts the 7-working-day evaluation clock: interview decision, candidate acceptance, supervisor assignment or another event? | Internship evaluation lifecycle |
| D-02 | Which days count as working days? What weekends/holidays calendar applies, and how are absence, paused evaluation or extensions handled? | Evaluation dates and reminders |
| D-03 | What evaluation criteria, minimum outcome, reviewer and approval authority decide pass/fail? Is extension/re-review possible? | Intern selection after the evaluation period |
| D-04 | What are the exact interview rounds, their order, required feedback fields and authorized final decision-makers for each opening type? | Recruitment workflow |
| D-05 | Which candidate profile fields are required? What happens on duplicate applications, account deletion, email change and password recovery? Can one account apply to multiple openings? | Candidate account/application system |
| D-06 | What is the retention period and deletion/anonymization policy for rejected applications and candidate documents? Who can access archived records? | Privacy, archive and retention |
| D-07 | What is the normal internship duration, extension policy, early-exit process and certificate eligibility checklist? | Internship completion |
| D-08 | What onboarding documents, verification checks, ID-card fields/number format, issuer and validity rules are required? | Onboarding and intern ID cards |
| D-09 | Who is the certificate signatory? Which exact fields, issue-number pattern, corrections/reissue process and public verification data are approved? | Certificates and QR verification |
| D-10 | What attendance method is needed: manual entries, timesheets, shift/roster, location, biometric or import/integration? What are correction and approval rules? | Attendance module |
| D-11 | What are the leave types, eligibility, accrual/balance rules, carry-forward, holidays, half-day rules, approval chain and leave-year definition? | Leave management |
| D-12 | What does payroll mean for v1: payroll records/export or calculation engine? Define salary components, pay cycle, deductions, payslip, employee classifications and applicable Indian statutory/tax rules. Who validates the calculations? | Payroll must remain unimplemented beyond approved scaffolding until defined |
| D-13 | What are the department, designation, reporting manager, probation, employee review, transfer and exit/offboarding policies? | Employee lifecycle and HRMS |
| D-14 | What exact progress reports and task review settings can administrators configure, and which changes apply to an already-running programme? | Configurable progress monitoring |
| D-15 | Which email provider/domain will be used, and what sender/from address is authorized? | Live email delivery (can be abstracted during scaffold) |
| D-16 | Which production object-storage provider will be selected and what file limits/retention rules apply? | Production document uploads (keep provider interface isolated meanwhile) |
| D-17 | Which production hosting target, PostgreSQL provider, backup/restore objective and background worker/scheduler will be used? | Production deployment and reliable scheduled jobs |
| D-18 | Which AI provider/model is approved for the chatbot? Which FAQ/policy documents are authoritative, and what is the fallback when AI is unavailable? | AI chatbot; approved static FAQ/help can be built earlier |
| D-19 | Provide the approved GARA logo, favicon/brand assets and any typography/color tokens that must be followed. | Accurate branding; do not generate a replacement logo |
| D-20 | Confirm exact roles and permission matrix for recruitment staff, interviewers, HR, coordinators, mentors, interns, employees and super administrators. | Production authorization matrix |

### Safe work that can proceed before these decisions

- Repository/environment setup.
- Design tokens and responsive shell.
- Documentation and architecture decisions.
- Auth foundation with secure default roles/guards.
- Opening and form-builder foundations.
- Candidate account foundation.
- Recruitment/application history foundations.
- Provider interfaces for email/storage/AI.
- Test infrastructure, migrations and audit-log foundation.

> **Active Decision Tracker:** All open items above (D-01 through D-20) are formally recorded and tracked in [`docs/OPEN_DECISIONS.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/OPEN_DECISIONS.md) (as items `OD-001` through `OD-020`), detailing the exact impact, affected modules, safe development tasks that may continue, and blocked workflows.

Do not claim the blocked workflows are complete just because their pages or database tables exist.

---

# 5. How to use these prompts

1. Create/open the target repository in your development environment.
2. Ensure this baseline is present as `docs/PROJECT_BASELINE.md` and `docs/GARA_Innovation_Project.md`.
3. **Pre-Prompt 0 — Project Constitution & Repository Blueprint:** `[COMPLETED ✅]`  
   - Generated persistent contract files: [`CLAUDE.md`](file:///Users/ashwanikushwaha/intern-hiring/CLAUDE.md), [`docs/PROJECT_RULES.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/PROJECT_RULES.md), [`docs/FOLDER_STRUCTURE.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/FOLDER_STRUCTURE.md), [`docs/ARCHITECTURE.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/ARCHITECTURE.md), [`docs/DATA_MODEL.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/DATA_MODEL.md), [`docs/SECURITY.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/SECURITY.md), [`docs/TESTING.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/TESTING.md), [`docs/OPEN_DECISIONS.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/OPEN_DECISIONS.md), [`docs/RUNBOOK.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/RUNBOOK.md), and [`docs/decisions/ADR-0001-modular-monolith.md`](file:///Users/ashwanikushwaha/intern-hiring/docs/decisions/ADR-0001-modular-monolith.md).
4. **Prompt 0 — Read-only discovery and implementation plan:** `[COMPLETED ✅]`  
5. **Prompt 1 — Foundation scaffold:** `[COMPLETED ✅]`  
6. **Prompt 2 — Public careers website, openings and dynamic form builder:** `[COMPLETED ✅]`  
7. **Prompt 3 — Candidate account, application submission and tracking:** `[COMPLETED ✅]`  
8. **Prompt 4 — Screening, interview scheduling and recruitment decisions:** `[COMPLETED ✅]`  
9. **Prompt 5 — Seven-working-day evaluation, intern onboarding and ID card:** `[NEXT PHASE ⏳]`  
   - Awaiting product owner authorization.

## Global instruction for all prompts

Paste this at the start of a Claude conversation or save it as a project instruction:

> You are the senior software architect and implementation engineer for GARA Innovation. Treat `docs/PROJECT_BASELINE.md` as the source of truth. Follow the confirmed decisions exactly. Do not invent business rules. For every unresolved policy, add/maintain `docs/OPEN_DECISIONS.md` with the question, why it matters, modules affected and safe work that can continue. Never silently choose a business default. Use stable, supported versions only; verify current official framework/package docs before selecting versions. Keep all provider integrations replaceable. Make incremental changes, run the relevant checks, report actual results and stop at the end of the requested phase. Do not claim tests, builds, OAuth, SMTP, storage or deployment work unless it was genuinely run and verified. Never copy TaskMaster's UI. Use GARA's exact approved logo asset if supplied; never redraw or replace it. Do not proceed to the next phase until the product owner authorizes it.

---

# 6. Prompt 0 — Read-only discovery and implementation plan

```text
Act as a principal software architect. Read `CLAUDE.md`, `docs/PROJECT_BASELINE.md`, `docs/PROJECT_RULES.md`, `docs/FOLDER_STRUCTURE.md`, `docs/ARCHITECTURE.md` and `docs/OPEN_DECISIONS.md` when present before proposing an implementation. Treat the approved project rules as the persistent engineering contract. If the project rules conflict with the baseline, do not silently reconcile them; identify the conflict for the product owner.

First inspect the current workspace safely:
- Check whether this is an empty directory, existing repository or existing application.
- Inspect package.json, lockfiles, source files, README, environment examples, existing tests and Git status when present.
- Do not overwrite files, remove dependencies, reset Git, run destructive commands or make application-code changes in this phase.
- If TaskMaster source code is present, review it only to identify candidate concepts that may be useful. Do not assume its README proves runtime correctness, and do not copy its UI/schema wholesale.

Verify current official documentation for:
- Stable Next.js version >=16.4 and its compatible React/Node versions.
- Current Node.js LTS compatibility.
- PostgreSQL and the latest stable GA ORM candidate.
- Better Auth email/password + Google login and PostgreSQL integration.
- Tailwind CSS v4 and current stable test tooling.
- Any relevant security/deprecation advisories.

Do not use canary, experimental, beta or release-candidate dependencies in production without explicit approval. In particular, verify the ORM's release status; prefer the latest compatible GA release.

Return a plan with:
1. Workspace/repository findings.
2. Proposed stable dependency versions with official source links and reasons.
3. Architecture and module boundaries.
4. Suggested directory structure.
5. Initial entity/data-model outline (not yet a final schema).
6. Security and permission strategy.
7. Migration, testing, logging and environment strategy.
8. A phase-by-phase implementation plan.
9. Open decisions from the baseline, especially the attendance/leave/payroll policy blockers.
10. Exact files/commands planned for Prompt 1.

Do not write or modify application code. Do not ask me to decide things already confirmed in the baseline. Ask only questions that are genuinely blocking a safe architecture choice. End with a concise approval checklist and wait.
```

---

# 7. Prompt 1 — Project initialization and engineering foundation

Run only after reviewing Prompt 0's plan.

```text
Initialize the GARA Innovation Recruitment & HRMS project according to docs/PROJECT_BASELINE.md and the approved Prompt 0 plan.

Before changing files, re-check Git status and inspect existing files. Preserve existing work. If the directory is empty, scaffold the agreed stable Next.js >=16.4 App Router application. If an app already exists, integrate carefully instead of recreating it.

Implement foundation only:
- TypeScript strict mode and clear import aliases.
- Tailwind CSS v4 stable.
- GARA design tokens: light/dark/system modes, soft professional palette, no gradients, restrained borders/shadows and Lucide React icons.
- A responsive public-site shell and a separate authenticated-app shell, using temporary but clearly labelled placeholder content only where approved brand assets are unavailable.
- Reusable accessible primitives and loading, empty, error, not-found and permission-denied states.
- Environment validation and `.env.example` placeholders. Never add real secrets.
- PostgreSQL connection and a stable GA ORM setup, following current official docs. Keep migrations versioned.
- Authentication library setup for email/password + Google only, using the approved plan. Provide a safe development configuration and document the OAuth variables/callback setup. Do not pretend Google OAuth works without real credentials.
- Secure session utilities and server-side authorization guard foundation. Do not allow public signup to self-assign any staff/admin role.
- Structured logging and safe error handling.
- Test/lint/type-check/build scripts appropriate to the selected stack.
- Documentation: `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/TESTING.md`, `docs/OPEN_DECISIONS.md`, and a local setup README.

Do not implement full recruitment, payroll or employee workflows in this phase. Do not create fake production metrics. Do not select a production email/storage/AI host without approval; define interfaces or document the remaining decision instead.

At the end:
1. Run install, typecheck, lint, tests and production build where feasible.
2. Report the exact commands and actual pass/fail results.
3. List changed files, migrations, required env vars and manual setup steps.
4. Record any failures or blockers honestly.
5. Stop and wait for approval before Phase 2.
```

---

# 8. Prompt 2 — Public careers website, openings and dynamic form builder

```text
Implement only the public careers/openings and administrator opening/form-builder foundation described in docs/PROJECT_BASELINE.md.

Requirements:
- New GARA-branded responsive careers pages and opening list/detail pages.
- Admin-controlled opening lifecycle: draft, published, paused, closed/filled, with backend transition checks.
- Dynamic form builder for configurable fields, sections, required/optional fields, order and validation schemas.
- Form versioning so edits never silently reinterpret submitted historical applications.
- Preview before publishing and explicit warnings before changes affect live openings.
- Candidate-facing UI must expose only published opening information.
- Keep field validation on the server with appropriate schema validation, upload limits and safe error messages.
- Use real database-backed records; any seed/demo content must be development-only and clearly labelled.
- Apply authorization checks to every administrative mutation and query.
- Do not fabricate opening fields that the business has not approved as mandatory. Make optional/custom fields configurable and record any unresolved required-field policy.
- Do not implement candidate submission/tracking yet except the interfaces needed by this phase.

Add tests for opening visibility, unauthorized edits, valid/invalid field configuration and form-version preservation. Run required quality checks, report actual results and stop.
```

---

# 9. Prompt 3 — Candidate account, application submission and tracking

```text
Implement candidate accounts, application submission and secure application tracking, using the existing foundation and docs/PROJECT_BASELINE.md.

Confirmed rule: candidate account is required before applying. Initial login methods are email/password and Google. Do not add GitHub or LinkedIn in v1.

Implement:
- Candidate account creation/sign-in and email verification/recovery paths according to the approved authentication configuration.
- Candidate role assigned only by trusted server-side logic; never accept a role from public form input.
- Candidate profile and opening-specific applications.
- Dynamic form rendering for the published form version.
- Server-side validation of all fields and file metadata.
- Submission record, unique internal ID and human-readable application reference.
- Candidate dashboard showing only that candidate's own applications and permitted statuses.
- Submission confirmation and notification/outbox record.
- Duplicate-application behavior only if the policy has been approved. If not, document D-05 and implement no arbitrary restriction.
- A candidate can never fetch another candidate's records by changing an ID or URL.
- Preserve submitted responses, opening/form version and status history.

For resumes/documents, introduce a storage-provider interface and a safe local development implementation only if it cannot accidentally become the production default. Keep documents private; don't put resumes in `public/`. If production storage is undecided, mark live document storage as blocked and document how to configure it.

Do not make candidate status visible from a reference number alone. Do not expose internal notes. Add authorization, validation, duplicate-submission and historical-form tests. Run checks and stop.
```

---

# 10. Prompt 4 — Screening, interview scheduling and recruitment decisions

```text
Implement the recruitment operations workflow only, according to docs/PROJECT_BASELINE.md and the decisions already approved.

Build:
- Recruiter application queue with search, filters, stage and assigned recruiter where configured.
- Secure resume/document preview or download.
- Internal screening notes separated from candidate-facing messages.
- Shortlist/reject/hold/advance actions only where an approved transition exists.
- Interview rounds and scheduling data structures/UI, assigned interviewer and structured feedback.
- Date/time-zone-safe scheduling and reschedule/cancel history.
- Distinction between an interviewer's recommendation and the authorized final decision.
- Application-stage and decision history with actor and timestamp.
- Email notification records for approved events; do not require a live SMTP provider in local tests.

Do not invent the interview rounds, pass scores, rejection rules, reminder cadence or final decision authority. If these have not been approved, implement generic configurable primitives only, add the missing policy to `docs/OPEN_DECISIONS.md`, and leave final decision transitions disabled until configured.

Protect all interview feedback and internal notes from candidates. Add server-side authorization tests for recruiters, interviewers, candidates and unprivileged users. Run checks, summarize actual behavior and stop.
```

---

# 11. Prompt 5 — Seven-working-day evaluation, intern onboarding and ID card

```text
Implement the internship entry workflow using docs/PROJECT_BASELINE.md.

Confirmed: the supervised evaluation period is seven WORKING days. The exact working-day calendar, start trigger, absence/extension behavior and pass/fail criteria may still be open.

Implement only approved behavior:
- A dedicated state for a candidate selected for supervised evaluation.
- A recorded evaluation period with start/end dates, assigned supervisor and configurable progress/checkpoint settings.
- A working-day calculation service that takes an explicitly configured calendar; do not hard-code public holidays or assume a weekend pattern when no policy exists.
- Progress/task/checkpoint reporting according to administrator-configured programme settings.
- Supervisor feedback and final review record.
- State transitions guarded by server-side permissions.
- Outcome notification records with retry-safe delivery.
- On approved evaluation only, an onboarding checklist and an intern record linked to the recruitment application.
- ID-card record/generation interface gated by required onboarding/approval conditions.
- Historical evaluation, task and review records must remain intact.

Do not choose evaluation start triggers, pass thresholds, who can approve, ID fields, number format or validity periods yourself. If unresolved, keep those transitions gated and update `docs/OPEN_DECISIONS.md` with the exact questions. Never issue an ID card merely because seven days elapsed.

Add date/calendar boundary tests, permission tests and tests proving that unresolved approval cannot be bypassed. Run checks and stop.
```

---

# 12. Prompt 6 — Internship tasks, configurable progress and completion certificates

```text
Implement intern work/progress tracking and certificate issuance only to the extent allowed by approved policies in docs/PROJECT_BASELINE.md.

Work management:
- Intern dashboard with assigned tasks, deadlines, status, submissions, review feedback and progress history.
- Authorized supervisor/admin task assignment.
- Submission version history and change-request/resubmission handling where approved.
- Configurable reporting cadence and forms; avoid one fixed global interval.
- If work-hour timing is not explicitly approved, do not enable it as a performance or eligibility rule.
- Preserve records after the internship closes; never perform destructive session rollover.

Completion/certificate:
- Build a configurable completion checklist driven only by approved requirements.
- Require an authorized completion decision before certificate generation.
- Generate a PDF with approved GARA brand assets, unique certificate ID and QR verification URL.
- Store an immutable issuance record and preserve correction/reissue history.
- Public verification must expose only fields explicitly approved for public display; never expose evaluation notes, private contact details or documents.
- Ensure repeated requests cannot issue duplicate certificates accidentally.

If duration rules, required approvals, signatory, certificate fields, ID pattern or reissue policy are still unresolved, implement the safe service interfaces/preview and tests but keep production issuance disabled. Update `docs/OPEN_DECISIONS.md`; do not fabricate a certificate policy or logo. Run PDF, authorization, verification and idempotency tests and stop.
```

---

# 13. Prompt 7 — Full-time recruitment and employee core

```text
Implement the approved full-time recruitment flow and core employee records without assuming unsupported HR policies.

Full-time recruitment:
- Reuse generic opening, application, form-version, interview and decision infrastructure where appropriate.
- Keep full-time stages independent from internship-only evaluation/onboarding stages.
- Implement offer preparation/acceptance status tracking only according to approved policy. Do not generate legally binding offer terms from invented salary or contract rules.
- Create employee records only after the approved hiring/joining conditions have been satisfied.

Employee core:
- Employee profile and employment history foundations.
- Department/designation/manager assignment as configured.
- Secure document metadata and access control.
- Onboarding checklist support.
- Configurable performance-review records only after criteria and permissions are approved.
- Exit/offboarding record support when the process is defined.

Do not implement attendance, leave balances or payroll calculations in this phase. Do not allow public signup to create an employee record or staff role. Clearly separate recruitment candidate records from employee records while preserving their relationship when an applicant is hired.

Document any open data-policy decisions, add authorization and lifecycle tests, run checks and stop.
```

---

# 14. Prompt 8A — Attendance module (blocked pending policy approval)

```text
Before coding attendance rules, inspect docs/OPEN_DECISIONS.md and confirm that D-10 has been answered and approved. If not, DO NOT implement attendance calculations. Return the exact unresolved questions and safe preparatory work only.

Once approved, implement the specified attendance method and policy exactly: shifts/rosters if required, calendar, allowed entry methods, correction requests, approval rules, lateness/absence definitions, reports and audit history. Do not assume biometric, location-based or automatic tracking. Do not silently infer attendance from task timers. Keep any hardware/provider integration replaceable.

Write tests from approved examples and edge cases. Ask for policy clarification when an expected result is unspecified. Run checks and stop.
```

# 15. Prompt 8B — Leave module (blocked pending policy approval)

```text
Before implementing leave balances or approval behavior, confirm D-11 is answered and approved. If not, do not invent leave types, accrual, carry-forward, encashment, half-day, holiday or approval rules.

Once approved, implement leave types, employee eligibility, leave-year/calendars, request/approval/cancellation workflow, balance calculation and audit history exactly as documented. All balances must be calculated server-side and tested for dates, overlapping requests, timezone/calendar boundaries and concurrent approvals.

If any rule required for a correct calculation remains unresolved, stop that calculation path and record the blocker. Run checks and stop.
```

# 16. Prompt 8C — Payroll module (blocked pending policy and compliance approval)

```text
Payroll is in the agreed HRMS scope, but do not calculate salary, statutory deductions, tax, benefits, overtime, reimbursements or payslips until D-12 is fully specified and the product owner has approved the policy and validation responsibility.

First produce a payroll requirements checklist covering the scope decision (records/export versus calculation engine), salary components, pay frequency, employee categories, proration, deductions, applicable jurisdiction/statutory rules, adjustments, approvals, payslip fields, access controls, audit trail and correction process. Identify any legal/accounting validation needed. Do not provide legal conclusions or guess statutory values.

Before approval, safe work is limited to documenting module boundaries, access requirements, audit/logging, provider/export interfaces and non-calculating placeholder screens. Do not label a placeholder as a working payroll engine.

After explicit approval, implement only the approved rules with precise unit tests, sample cases supplied/approved by the owner, access control and audited corrections. If a rule is absent, ask rather than guess. Run checks and stop.
```

---

# 17. Prompt 9 — Portal-only chatbot, FAQ and reports

```text
Implement the GARA portal help/chatbot and reporting within docs/PROJECT_BASELINE.md.

Chatbot scope:
- Answer only questions about the GARA portal, application process, published programme rules, onboarding, progress reporting, certificate verification and approved FAQs.
- Start with an approved, versioned FAQ/knowledge source where possible.
- Use a replaceable provider adapter; do not embed provider-specific business logic across the application.
- Do not select a paid/free AI model without approval. If the provider is undecided, implement an FAQ/help foundation and provider interface, not fake AI responses.
- Do not answer general unrelated questions beyond a polite scope message.
- For personal status questions, authenticate the user and retrieve only that user's authorized data server-side. Never depend on prompt instructions alone for privacy.
- Do not send resumes, employee files, payroll data or private evaluation notes to an AI provider.
- Provide graceful fallback when AI is unavailable.

Reports:
- Use real database data and clearly specify report filters/time periods.
- Enforce report-level permissions and avoid exposing private fields in exports.
- Track consequential exports where appropriate.

Test prompt-injection attempts, cross-candidate access, unsupported questions, provider failure and correct fallback. Run checks and stop.
```

---

# 18. Prompt 10 — Production hardening and release gate

```text
Perform a production-readiness review of the implemented GARA Innovation platform. Do not add new scope or silently alter business rules.

Review and test:
- Authentication, session handling, OAuth callback configuration and account linking.
- Server-side authorization for every sensitive read/write path.
- Candidate-to-employee linking and role escalation prevention.
- Sensitive document access, signed URL expiration and upload validation.
- Application/form/workflow history and database constraints.
- Duplicate submission, email retries and certificate issuance idempotency.
- Audit events for important decisions and privileged changes.
- Durable notification/background processing and operational failure handling.
- Rate limiting suitable for multi-instance production (not process-local memory only).
- CSRF/origin protections where applicable, security headers, input/output handling and secret hygiene.
- Accessibility, keyboard navigation, contrast and responsive layouts across mobile/tablet/desktop.
- Database migration safety, indexes, backup/restore procedures and documented recovery steps.
- Environment validation, safe error reporting and health checks.
- Tests for unresolved-policy gates: the application must not bypass a workflow whose required policy is unapproved.

Run the project's full verify command, production build and end-to-end tests that can genuinely run in the current environment. Clearly separate automated checks from manual steps needing real OAuth/email/storage credentials. Do not claim production readiness if critical decisions or credentials remain open.

Produce:
1. Executive summary.
2. Exact checks and results.
3. Critical/high/medium/low findings with file references.
4. Fixes completed in this phase.
5. Remaining release blockers.
6. Deployment and backup runbook.
7. A final request for approval before deployment.
```

---

# 19. Expected deliverables before production

- Approved `docs/PROJECT_BASELINE.md` and maintained `docs/OPEN_DECISIONS.md`.
- Architecture and data-model documentation.
- Role/permission matrix.
- Database schema and versioned migrations.
- Responsive GARA-branded screens with accessible states.
- Server-side validation and authorization tests.
- Email templates and reliable delivery-state tracking.
- Private document storage configuration.
- Recruitment and internship workflow histories.
- PDF certificate issuance and verification, gated by approved rules.
- Attendance/leave/payroll implementations only after their policies are approved.
- Setup, environment, migration, backup/restore, deployment and incident notes.
- Evidence of typecheck, lint, automated tests and production build.

## Final operating rule

**One prompt = one bounded phase.** After each phase, review the implementation and test evidence. Do not authorize the next phase until the previous phase is accepted. If a requirement is unclear, ask for a decision rather than inventing one.
