# Security & Bug Remediation Checklist — GARA Innovation Platform

> Source: full-project audit performed on 2026-10-23 (core layer reviewed directly; feature modules traced end to end).
> Product-owner decisions recorded on 2026-10-24:
> - Business rules that were implemented without approval are **policy-gated** (removed or replaced with `PolicyBlockedError` / "Not configured"), and tracked in `docs/OPEN_DECISIONS.md`.
> - `tests/` is kept local only (excluded from Git by product-owner decision on 2026-10-24, after briefly being tracked).
>
> Legend: `[ ]` open · `[x]` fixed in code (see "Verification" at the bottom for evidence) · `[!]` requires a manual owner action outside the codebase · `[~]` deferred, needs a product decision

---

## 0. Manual owner actions (cannot be done in code)

- [!] **OPS-01 Rotate every secret.** Commit `9be7b59` shipped `/api/debug-env`, which printed the first 6 and last 4 characters of `DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `SMTP_PASS` and others. Rotate the database password, `BETTER_AUTH_SECRET`, the Gmail SMTP app password, the Google OAuth client secret and the Cloudinary API secret, then update Vercel environment variables.
- [!] **OPS-02 Change the seeded account passwords.** The default admin and sub-admin seed passwords exist in Git history (commits `eec04b5`, `0470d50`) and the admin password is also written as a comment in the local `.env`. Change both account passwords and delete the comment from `.env`.
- [!] **OPS-03 Revoke sessions after rotation.** Rotating `BETTER_AUTH_SECRET` invalidates signed cookies; additionally clear the `sessions` table once.
- [x] **OPS-04 Configure `CRON_SECRET`** in Vercel so the outbox retry cron (`/api/cron/outbox`) is authorized. The Vercel Hobby plan only allows daily cron schedules; immediate delivery is handled in-request (see BUG-01). *Status 2026-10-24:* a 43-character secret was generated into the local `.env` and the whole `.env` passes the production-runtime schema check with no readiness blockers. Copying it to Vercel is still required (no Vercel CLI/session on this machine). *Done 2026-10-24:* the owner added `CRON_SECRET` to Vercel (reported by the owner; not verifiable from this machine).
- [x] **OPS-05 Apply database migrations** using the baseline procedure in `docs/RUNBOOK.md` (mark the baseline as applied, then deploy the hardening migration). Take a `pg_dump` first. *Status 2026-10-24:* pre-checks done against the Neon direct endpoint — live schema has **zero drift** from the baseline, no duplicate task submissions, both FKs present, no `_prisma_migrations` table yet. A consistent JSON snapshot of all 39 tables (55 rows) is in `.storage/db-backups/2026-10-24T17-30-24-688Z/` (gitignored, owner-only permissions). *Applied 2026-10-24 by the owner:* `migrate resolve --applied 20261024000000_baseline` + `migrate deploy`. Post-check (read-only): `_prisma_migrations` lists both migrations finished, live schema has **zero drift** from `prisma/schema.prisma`, both FKs are now `RESTRICT`, `rate_limits` table, `claimedAt` / `disbursedAmount` columns and all 5 new indexes exist, and the 39 original tables still hold 55 rows.
- [x] **OPS-06 Confirm strict database TLS** works against the production PostgreSQL provider after SEC-18. *Verified 2026-10-24:* both Neon endpoints (pooled and direct, PostgreSQL 18.6) accept connections with `rejectUnauthorized: true`; the URL already uses `sslmode=verify-full`. `.env` sets `DATABASE_SSL_REJECT_UNAUTHORIZED="true"`.

## 1. Critical

- [x] **SEC-01 Vulnerable dependencies.** `next@16.4.0` had unauthenticated RCE (Image Optimization, `use cache`) and a Server Actions DoS; transitive `nodemailer`, `undici` and `fast-uri` advisories. → Upgraded to `next@16.4.3` / `eslint-config-next@16.4.3`, ran `npm audit fix`.
- [x] **SEC-02 Unauthenticated password overwrite.** `forgotPasswordAction` replaced any account's password (including ADMIN) with a low-entropy temporary password, with no rate limit, and leaked account existence. → Replace with Better Auth token-based reset link (`requestPasswordReset` → emailed link → `/reset-password`), 1-hour single-use token, sessions revoked on reset, rate limited.
- [x] **SEC-03 Account / role enumeration.** `checkUserMustChangePasswordAction(email)` returned the roles of any email without authentication. → Replace with a session-based post-login redirect action.
- [x] **SEC-04 Environment validation fails open.** Any invalid variable replaced the whole environment with defaults, including a public development secret and a localhost database; production only logged. → Fail closed in production runtime; keep valid values in development.
- [x] **SEC-05 Granular sub-admin permissions not enforced server-side.** `canApplications`, `canOpenings`, `canInterviews`, `canEvaluations`, `canEmployees`, `canAttendance`, `canLeave`, `canPayroll`, `canReports` only hid navigation. → Central `requirePermission()` guard used by every staff Server Action, service and page; permission lookup no longer falls back to defaults on database errors.
- [x] **SEC-06 Fabricated payroll data.** Missing payout data defaulted to bank account `50100482910482`, IFSC `HDFC0000123`, PAN `ABCDE1234F` and ₹25k/₹45k stipends; reports used ₹35k. → Removed; unset values render as "Not configured" and are excluded from totals.
- [x] **SEC-07 Seed scripts.** Default passwords, no production guard, admin not forced to change password, password printed to stdout. → Require passwords via environment, refuse non-local databases without `--allow-remote`, set `mustChangePassword`, never print secrets.

## 2. High

- [x] **SEC-08 Notification bell leaks PII to every signed-in user** (including candidates): other candidates' names, leave requests and reasons. Also shows hard-coded fake notifications. → Scope notifications by role and permission; remove fake entries.
- [x] **SEC-09 `/hrms/attendance` exposes all employees' attendance and emails to interns.** → Staff with `canAttendance` see the team view; everyone else sees only their own records.
- [x] **SEC-10 `seedDefaultLeaveTypesAction` has no authentication.** → ADMIN only.
- [x] **SEC-11 Certificates can be issued to failed or never-started interns.** Completion approval is role-only, an empty checklist counts as "all completed", and issuance never checks the evaluation outcome. → Server-side checklist validation (non-empty, all required items), supervisor/permission scoping, issuance requires `PASSED`.
- [x] **SEC-12 Offer and hiring flow can bypass candidate consent.** (Re-offers after a decline/revoke are blocked by the `JobOffer.applicationId` unique constraint — see OPEN_DECISIONS follow-up 1.) Status can be moved to `OFFER_ACCEPTED` without an accepted `JobOffer`; revoked offers stay hireable; a candidate can resurrect a rejected application. → Hiring requires an `ACCEPTED` offer; offer decisions validate the application's current status; offer/application updates are atomic.
- [x] **SEC-13 Leave self-approval.** HR/managers can approve their own requests. → Reviewer must not be the requester; `canLeave` enforced.
- [x] **SEC-14 Sub-admin removal hard-deletes the user**, cascading employee, attendance, leave and payroll history; permission updates delete every non-staff role (e.g. `EMPLOYEE`). → Removal revokes staff roles, permissions and sessions while preserving history; updates replace only staff roles.
- [x] **SEC-15 Mentors/managers can act on any intern.** OD-001 limits evaluation actions to ADMIN, HR or the assigned supervisor. → Enforce supervisor scoping plus `canEvaluations`.
- [x] **SEC-16 Payroll integrity.** HR without `canPayroll` can read full bank account numbers and PANs and mark payments disbursed; period status can move arbitrarily (PAID → DRAFT); disbursement is non-atomic and can double-pay. → `canPayroll` required, explicit status machine, conditional atomic updates, audit log, account numbers masked server-side.
- [x] **BUG-01 Queued emails are never sent.** Nothing invokes the outbox processor. → Flush after each enqueueing request via `after()`, plus a secured cron route for retries.

## 3. Medium

- [x] **SEC-17 Over-broad trusted origins.** `https://*.vercel.app` trusts every Vercel-hosted site, and localhost is trusted in production. → Explicit origins only; localhost only outside production.
- [x] **SEC-18 Database TLS certificate verification disabled** (`rejectUnauthorized: false`). → Verify by default; explicit opt-out variable.
- [x] **SEC-19 CSP allows `'unsafe-eval'` in production.** → Development only. (`'unsafe-inline'` remains until ENG-08.) `upgrade-insecure-requests` added in production.
- [x] **SEC-20 Internal error messages returned to clients** from almost every Server Action and from `/api/auth`. → `toActionError()` returns only operational `AppError` messages; everything else is logged and replaced with a generic message.
- [x] **SEC-21 Rate-limiting gaps.** Only the chatbot and certificate verification were limited; the Postgres limiter had a check-then-insert race; Better Auth's limiter used per-instance memory. → Atomic limiter (transaction + advisory lock), Better Auth database storage, limits on application submission, verification page, visitor tracking.
- [x] **SEC-22 HTML injection in emails.** Names, messages, reasons and meeting links were interpolated unescaped. → Escape all interpolated values; allow only `http(s)` links.
- [x] **SEC-23 Pages relying on layout-only authorization** (e.g. `/admin`, `/admin/applications`, `/admin/employees`). → Every data-loading page performs its own check.
- [x] **SEC-24 Forced password change not enforced server-side**, and `setNewPasswordAction` accepts a new password without the current one and keeps other sessions alive. → Guards reject users with `mustChangePassword`; the action only works for that state and revokes other sessions.
- [x] **SEC-25 Open redirect via `callbackUrl`** (e.g. `/\evil.com`). → Strict same-origin path validation.
- [x] **SEC-26 Resume download ignores `canApplications`.** → Enforced.
- [x] **SEC-27 Attendance falsification and employee creation.** Employees control their own checkout/notes/entry method; managers can turn any user into an active employee. → Self check-in/out uses server time only; the unused `ensureEmployeeForUserAction` (which could turn any user into an employee) was removed.
- [x] **SEC-28 Visitor tracking** is unauthenticated, unthrottled and shows a fabricated 1,480 baseline. → Rate limited, baseline removed.
- [x] **SEC-29 CSV formula-injection guard incomplete** (leading tab / carriage return). → Fixed.
- [x] **SEC-30 Employee directory service has no authorization.** → Requires `canEmployees`.
- [~] **SEC-31 Interviewers/managers can read every application**, including other interviewers' confidential feedback. `canApplications` is now enforced; assignment-based scoping requires the OD-019 permission matrix.

## 4. Correctness and data integrity

- [x] **BUG-02** Server Action body limit (1 MB default) blocked the advertised 5 MB resume upload. → `bodySizeLimit` raised to fit 5 MB plus multipart overhead.
- [x] **BUG-03** `LocalStorageService` throws in production, so resume upload cannot work on Vercel. → Interim product decision (2026-10-25): candidates share an https resume link (`DOCUMENT_STORAGE_MODE=link`, default); uploads return with `DOCUMENT_STORAGE_MODE=local` on the organisation's own server.
- [x] **BUG-04** Interview lifecycle has no status checks (schedule on closed applications, reschedule/cancel completed interviews, feedback on cancelled interviews).
- [x] **BUG-05** Evaluation start/finalize accept any status (PASSED can be reset or flipped).
- [x] **BUG-06** Checkpoint review/submit accept invalid states.
- [x] **BUG-07** Task review accepts invalid statuses and stale submissions; submission versioning races.
- [x] **BUG-08** Payroll period status machine missing (see SEC-16).
- [x] **BUG-09** Employee status can move from any value to any value, including `EXITED` without an exit record.
- [x] **BUG-10** Leave approval → attendance sync is non-transactional, unbounded in range and mixes local/UTC dates.
- [x] **BUG-11** Time-of-check/time-of-use races in offers, openings and applications.
- [x] **BUG-12** Interview feedback edits keep the original interviewer attribution and lose history.
- [x] **BUG-13** Candidates see DRAFT/REVOKED offers and HR's internal revoke reason.
- [x] **BUG-14** Certificate reissue overwrites the verification code (old code reports "not found"); download returns 500 for authorization failures.
- [x] **BUG-15** Application reference year hard-coded to 2026.
- [x] **BUG-16** Form validator: required checkbox accepts `false`, file fields accept arbitrary JSON, multiselect options unchecked.
- [x] **BUG-17** Resume is uploaded before the database transaction, leaving orphaned files on failure.
- [x] **BUG-18** Sub-admin pages crash for valid permission combinations (MANAGER + `canOpenings`, MENTOR + `canApplications`). → No crash; `canOpenings` is the only openings gate. MENTOR + `canApplications` shows an "unavailable" notice pending OD-019.
- [x] **BUG-19** HR is linked to `/recruitment/...` routes, which `next.config.ts` redirects to `/admin` and then bounces. → New `/subadmin/openings/new`, `[id]/edit`, `[id]/preview` routes; `/subadmin/evaluations/[id]` cockpit added.
- [x] **BUG-20** Intern self check-in button compares an email with a user id and never matches.
- [x] **BUG-21** Interviewers cannot submit feedback (scheduler never sends `interviewerId`); the application page crashes for interviewers when an offer exists.
- [x] **BUG-22** Lint errors in `dashboard-notifications.tsx` and `analytics-charts.tsx`.
- [x] **BUG-23** Public `/verify/[code]` page is not rate limited and logs every lookup as `anonymous`.
- [x] **BUG-24** Outbox processor: exhausted FAILED rows block the batch forever; claiming is not atomic; crashed rows stay PROCESSING.

## 5. Policy gates (rules implemented without product-owner approval)

- [x] **POL-01** Duplicate-application blocking (OD-005) → removed; submissions are rate limited instead.
- [x] **POL-02** Hard-coded leave quotas and computed balances in the UI (OD-007) → removed.
- [x] **POL-03** Default stipend amounts (OD-008) → removed (see SEC-06).
- [x] **POL-04** Payroll periods auto-created on page load, employees auto-enrolled, random "UTR" references generated (OD-008) → explicit staff actions; references must be entered.
- [x] **POL-05** Offer defaults ("3 months" probation, working hours) (OD-020) → removed.
- [x] **POL-06** Exit clearance hard-coded to `CLEARED` (OD-015) → not set automatically.
- [x] **POL-07** Evaluation finalize auto-grants OFFERED / INTERN role (OD-003, OD-020) → policy-gated.
- [x] **POL-08** Interview scheduling/feedback auto-advances application status (OD-004) → removed; staff transition explicitly.
- [x] **POL-09** Declined offer auto-withdraws the application (OD-020) → policy-gated.
- [x] **POL-10** ID card number series `GARA-INT-2026-` (OD-014) → neutral provisional format, recorded as pending.
- [x] **POL-11** Rejected attendance regularization forces `ABSENT` (OD-006) → removed.
- [x] **POL-12** Fabricated UI content: fake notifications, visitor baseline, placeholder WhatsApp number, default "Bangalore / Hybrid" location, demo "Try sample code" button, unverifiable "tamper-proof ledger / 256-bit immutable" claims, "7-day" copy.
- [~] **POL-13** Default onboarding checklist items and default leave-type catalogue — recorded in `docs/OPEN_DECISIONS.md` for approval; unchanged.

## 6. Findings from the independent post-fix review

- [x] **REV-01 (High)** Payout data could be injected through employee `internalNotes` by HR without `canPayroll` (hire / direct-create forms). → The `PAYROLL_PROFILE:` marker is reserved for the payroll module (`src/features/payroll/payout-notes.ts`); other modules reject it.
- [x] **REV-02 (Medium)** Full account numbers / PAN were rendered on employee detail pages via raw `internalNotes`. → The payout block is stripped before notes leave the employees service.
- [x] **REV-03 (Medium)** Disbursed totals were recomputed from the current payout profile. → `payroll_records.disbursedAmount` snapshot written at disbursement; payroll and reports totals use it (legacy rows are counted as "without amount", never guessed).
- [x] **REV-04 (Low)** Saving a payout profile for a previously unpaid employee erased the hidden stored amount. → An empty amount for such an employee means "unchanged".
- [x] **REV-05 (Low)** Chatbot accepted temporary-password sessions as signed-in users. → Treated as guests.
- [x] **REV-06 (Low)** Analytics queries turned database failures into real-looking zeros. → Failures now surface to the error boundary.
- [x] **REV-07 (High)** Checkpoint reviews could never happen (PENDING checkpoints not reviewable; no intern submission UI). → Authorized supervisors/HR review PENDING or SUBMITTED checkpoints with an explicitly chosen outcome (audit-logged); interns can submit notes for their own checkpoints from the intern dashboard.
- [x] **REV-08 (Medium)** Staff could act on their own application (stage changes, feedback, offers, hire). → `assertNotOwnApplication` on stage changes, recruiter assignment, interviews, feedback, offers and hire; own applications are excluded from staff views. Employees service also blocks staff from changing their own status, reporting line, exit or onboarding record.
- [x] **REV-09 (Medium)** Interviewers could read every application, all feedback, internal notes, resumes and meeting links. → Users whose only staff role is INTERVIEWER see only assigned applications, their own rounds and feedback; internal notes, actor emails and unassigned resumes are withheld (service layer). MANAGER unchanged pending OD-019.
- [x] **REV-10 (Low)** Revoking an offer after an interview action could restore `OFFERED`. → Revoke restores the latest stage that moved *into* OFFERED from a different stage (fallback INTERVIEWED, audit-flagged); interview actions no longer write same-stage history rows.
- [x] **REV-11 (Low)** Interns who passed were redirected away from their HRMS self-service pages. → The HRMS layout also admits enrollment owners (self-service only; no role granted).
- [x] **REV-12 (Low)** Raw certificate rows and staff emails were passed to the intern's browser. → Only rendered fields are selected and passed to client components.
- [x] **REV-13 (Low)** Certificate and ID-card issuance checked eligibility outside the transaction. → Eligibility checks run inside the transaction under a row lock (`SELECT … FOR UPDATE`).
- [x] **REV-14** Employee directory linked HR to the unreachable `/recruitment/employees/:id`. → Directory links go to `/admin/employees/:id` or the new guarded `/subadmin/employees/:id`.
- [~] **REV-15** A FINALIZED payroll period cannot reach PAID/VOID if an employee is switched to Unpaid before disbursement (no per-record void). Workaround: switch back to Paid and record the reference. Needs a product decision on per-record voiding.

## 7. Engineering hygiene

- [x] **ENG-01** No versioned migrations (`prisma/migrations` missing) → `20261024000000_baseline` + `20261024000100_security_hardening` created. **Not applied** — see OPS-05.
- [~] **ENG-02** `tests/` excluded by `.gitignore`. → Product-owner decision (2026-10-24): tests stay local only; they were untracked again with `git rm --cached` (files kept). CI cannot run them.
- [x] **ENG-03** `.env.example` missing although README references it → per product-owner decision (2026-10-24) a single gitignored `.env` holds every variable; README/RUNBOOK point to the variable table in `docs/RUNBOOK.md` §2.
- [x] **ENG-04** README / release report claim Playwright and outdated results → corrected.
- [x] **ENG-05** Missing index on `verifications.identifier`; Better Auth rate-limit table → added.
- [x] **ENG-06** `User → Employee` and `User → InternshipEnrollment` cascade deletes → `Restrict`.
- [~] **ENG-07** No integration or end-to-end tests (only mocked unit tests). → Playwright suite added (2026-10-25, `tests/e2e`, `docs/RUNBOOK.md` §3.1): public pages, 375 px layout, auth validation and security headers run without a database; the two hiring journeys run against a dedicated test database. Still open: database-level integration tests (locks, conditional updates) and running the journeys regularly.
- [~] **ENG-08** Nonce-based CSP to remove `'unsafe-inline'` (requires dynamic rendering for every page).
- [x] **ENG-09** Remove the unreachable `/recruitment/*` route tree once HR/sub-admin screens fully replace it. → Removed (13 files) together with the unreachable `src/app/candidate/page.tsx`; the `next.config.ts` redirects keep old links working.
- [x] **ENG-10** Unused code and assets (2026-10-24, verified with `knip@5.88.1` plus manual checks against `src/` and the local tests): 16 dead symbols (9 Server Actions without callers, 3 schemas, `requireOwnership`, `hasSubAdminAccess`, `isSubAdminRole`, `CardDescription`), `src/features/openings/types.ts`, five Next.js template SVGs, two duplicate root logo files, and the unused devDependencies `@tailwindcss/turbopack` and `@testing-library/jest-dom`. Kept on purpose: `prisma7.config.ts` (loaded by the Prisma CLI), `@testing-library/react` (local tests), symbols used inside their own module or by local tests, and unused official brand variants in `public/brand/`.

---

## Verification (2026-10-24)

Commands run against the working tree after all fixes (no database was touched; the build used an unreachable dummy `DATABASE_URL`):

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | Pass — 0 errors |
| ESLint | `npm run lint` | Pass — 0 errors, 0 warnings (was 2 errors, 30 warnings) |
| Unit tests | `npx vitest run` (local only) | Pass — 16 files, 454/454 tests (was 131) |
| Dependencies | `npm audit` | 0 vulnerabilities (was 1 critical: `next@16.4.0`) |
| Production build | `npm run build` | Pass — 79 routes |

Re-run on 2026-10-25 after rounds 3–4: TypeScript 0 errors, ESLint 0 errors, Vitest 27 files / 887 tests passed, `npm audit --omit=dev` 0 vulnerabilities, production build passed (74 routes). Migrations `20261026000000_employment_periods_jobs` and `20261027000000_scheduling_esign_sources` were applied to Neon after a schema-drift check and a data backup; the post-deploy diff is empty.

Re-run on 2026-10-26 after the performance round: TypeScript 0 errors, ESLint 0 errors, Vitest 30 files / 1002 tests passed, `npm audit --omit=dev` 0 vulnerabilities, production build passed, Playwright public suite 43 passed / 21 skipped (database journeys) / 0 failed. Migration `20261028000000_performance_indexes` (19 indexes, no other statements) applied to Neon after a drift check and a data backup; the post-deploy diff is empty.

What this does **not** prove:
- End-to-end tests exist since 2026-10-25, but database behaviour (row locks, advisory locks, conditional updates) is still verified only against mocks (ENG-07).
- Migrations were applied to the Neon database and verified with a schema diff (OPS-05); application behaviour against it has not been exercised yet.
- Email delivery (including calendar invites), Google OAuth and the job-runner trigger (`/api/jobs/run`) have not been exercised against live providers.
- Production readiness still depends on the owner actions in section 0 and the product decisions in `docs/OPEN_DECISIONS.md`.

Summary: 89 items fixed or verified, 7 deferred pending product decisions (`[~]`), 3 owner actions outstanding (`[!]`).
