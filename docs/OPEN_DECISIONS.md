# Open Decisions — GARA Innovation

> This document tracks business and product decisions that have NOT been approved by the product owner.
> **No engineer may invent, assume, or implement rules for these items.**
> Each item must be resolved with explicit product-owner approval before implementation.
>
> Items are drawn from `docs/PROJECT_BASELINE.md` Section 4 (D-01 through D-20) and supplemented
> with engineering-identified gaps. Baseline IDs are preserved as cross-references.

---

## OD-001: Internship Evaluation Start Trigger *(Baseline D-01)*

**Question:** What event starts the 7-working-day evaluation countdown? Is it the interview decision, candidate acceptance, supervisor assignment, or another event?

**Why it matters:** The evaluation window determines deadlines for mentor reviews, task completion tracking, and pass/fail determination. Getting this wrong means interns may be evaluated against the wrong timeline.

**Affected modules:** `internship-evaluation`, `progress`, `intern-tasks`, `notifications`

**Safe work that can proceed:** UI scaffolding for evaluation screens, database schema for evaluation records (without trigger logic), notification templates.

**Status Update (Prompt 5):** Implemented `InternshipEnrollment` with `PENDING_TRIGGER` status. The 7-working-day countdown does not start automatically upon candidate acceptance; it requires an explicit manual trigger (`triggerEvaluationStartAction`) by authorized staff (`ADMIN`, `HR`, or assigned supervisor), which stamps `startDate` and schedules the 7 daily checkpoints using the working day calculation engine.

**Blocked until approval:** Automated countdown triggers (if any), automated reminder scheduling.

---

## OD-002: Holiday Calendar for Working-Day Calculation *(Baseline D-02)*

**Question:** Which days count as working days? What weekends/holidays calendar applies? How are absence, paused evaluation, or extensions handled?

**Why it matters:** "7 working days" is meaningless without a defined calendar. Different calendars yield different end dates.

**Affected modules:** `internship-evaluation`, `attendance`, `leave`

**Safe work that can proceed:** Schema for a configurable holiday calendar table. Working-day calculation service that accepts an explicitly configured calendar.

**Status Update (Prompt 5):** Implemented `WorkingDayService` (`src/features/internship-evaluation/services/working-day-service.ts`) accepting a structured `WorkingDayCalendarConfig` (custom working days of week, arbitrary holiday strings `YYYY-MM-DD`, and timezone support). A neutral default configuration is provided, but no official corporate holiday dates were assumed or hardcoded. Full test coverage validates custom calendar handling and weekend/holiday skipping.

**Blocked until approval:** Company-wide official holiday calendar feed/approval, absence and pause handling policies.

---

## OD-003: Evaluation Criteria and Pass/Fail Rules *(Baseline D-03)*

**Question:** What evaluation criteria, minimum outcome, reviewer, and approval authority decide pass/fail? Is extension or re-review possible?

**Why it matters:** Without defined criteria, the system cannot make or support pass/fail decisions. Arbitrary criteria could lead to disputes.

**Affected modules:** `internship-evaluation`, `progress`, `certificates`, `onboarding`

**Safe work that can proceed:** Evaluation form UI (without scoring logic), schema for storing evaluation results.

**Status Update (Prompt 5):** Daily checkpoint feedback and scoring are captured via `EvaluationCheckpoint` records with supervisor notes and scores. Final pass/fail determination is not automated by heuristic algorithms; it strictly requires an authorized human decision via `finalizeEvaluationAction` (with explicit review notes and decision maker attribution).

**Blocked until approval:** Automated threshold scoring rules, programmatic auto-pass/fail conditions, employee conversion rules.

---

## OD-004: Interview Rounds and Decision Authority *(Baseline D-04)*

**Question:** What are the exact interview rounds, their order, required feedback fields, and authorized final decision-makers for each opening type?

**Why it matters:** The recruitment workflow depends on knowing how many rounds exist, what data is captured per round, and who has authority to make the final selection decision. Generic primitives can be built, but production workflows cannot be enabled without this.

**Affected modules:** `interviews`, `recruitment`, `notifications`

**Safe work that can proceed:** Configurable interview round data structures, generic feedback forms, scheduling UI.

**Status Update (Prompt 4):** Configurable interview scheduling (`InterviewSchedule`), round ordering, date/time timezone handling, reschedule/cancellation justification tracking, and structured scorecard feedback (`InterviewFeedback`) are implemented. As required by engineering policy, interviewer recommendations (`STRONG_HIRE`, `HIRE`, `HOLD`, `NO_HIRE`) remain strictly advisory and separated from administrative final stage decisions (which require `ADMIN` or `HR` role authorization). Fixed round workflows and auto-advancement rules remain policy-gated pending business approval.

**Blocked until approval:** Fixed interview workflows, round-specific validation, final decision transitions with authority checks.

---

## OD-005: Candidate Profile and Application Policies *(Baseline D-05)*

**Question:** Which candidate profile fields are required? What happens on duplicate applications, account deletion, email change, and password recovery? Can one account apply to multiple openings?

**Why it matters:** These rules affect data integrity, user experience, and privacy. Allowing or blocking duplicate applications has significant UX and fairness implications.

**Affected modules:** `auth`, `applications`, `openings`

**Safe work that can proceed:** Basic candidate profile, application form rendering, submission record creation.

**Status Update (Prompt 3):** Candidate profiles and dynamic application form rendering are implemented. In accordance with Prompt 3 instructions, no arbitrary restrictions were imposed on applying to multiple openings, and active submissions are recorded with full status history and immutable form version references. Strict duplicate blocking remains policy-gated pending product owner approval.

**Blocked until approval:** Duplicate application enforcement, account deletion workflow, required-field validation rules.

---

## OD-006: Attendance Policies *(Baseline D-10)*

**Question:** What attendance method is needed (manual entries, timesheets, shift/roster, location, biometric, or import)? What are correction and approval rules? What are work hours, grace periods, overtime rules?

**Why it matters:** Attendance directly affects leave calculations, payroll, and compliance. Wrong assumptions create legal and financial risk.

**Affected modules:** `attendance`, `leave`, `payroll`

**Safe work that can proceed:** Schema design for attendance records (clock-in/out timestamps). UI wireframes.

**Status Update (Prompt 8A):** Implemented structural data models (`AttendanceRecord`, `AttendanceRegularization`) and safe operational service under `src/features/attendance/`. Supports timestamp logging and correction requests. Lateness penalties, overtime formulas, and automatic timer inferences are explicitly policy-gated and throw `PolicyBlockedError("OD-006")`. Non-calculating UI placeholder live at `/hrms/attendance`.

**Blocked until approval:** Attendance calculation logic, policy enforcement, overtime computation, correction workflows, hardware/provider integration.

---

## OD-007: Leave Policies *(Baseline D-11)*

**Question:** What leave types exist and their eligibility rules? What are accrual/balance rules, carry-forward limits, holiday calendars, half-day rules, approval chains, and leave-year definitions?

**Why it matters:** Leave policies vary by jurisdiction and organization. Incorrect leave calculations create legal liability.

**Affected modules:** `leave`, `attendance`, `payroll`

**Safe work that can proceed:** Schema for leave types, leave requests, and approval records.

**Status Update (Prompt 8B):** Implemented structural data models (`LeaveType`, `LeaveRequest`) and request/approval service under `src/features/leave/`. Leave balance accruals, encashments, and carry-forward formulas are explicitly policy-gated and throw `PolicyBlockedError("OD-007")`. Non-calculating UI placeholder live at `/hrms/leave`.

**Blocked until approval:** Leave balance calculation, accrual logic, policy enforcement, leave-payroll integration.

---

## OD-008: Payroll Rules and Statutory Requirements *(Baseline D-12)*

**Question:** What does payroll mean for v1 — records/export or calculation engine? What are salary components, pay cycle, deductions, payslip fields, employee classifications, and applicable statutory/tax rules? Who validates the calculations?

**Why it matters:** Payroll errors have direct legal and financial consequences. Every jurisdiction has specific statutory requirements.

**Affected modules:** `payroll`, `attendance`, `leave`, `employees`

**Safe work that can proceed:** Schema for payroll records and salary components. Module boundary documentation. Non-calculating placeholder screens (clearly labeled).

**Status Update (Prompt 8C):** Implemented structural data models (`PayrollPeriod`, `PayrollRecord`) and safe disbursement tracking service under `src/features/payroll/`. Produced comprehensive `docs/PAYROLL_REQUIREMENTS.md` checklist covering scope options (records/export vs calculation engine), salary components, statutory deductions, and legal sign-offs. Salary component calculations and statutory deduction engines are explicitly policy-gated and throw `PolicyBlockedError("OD-008")`. Non-calculating UI placeholder live at `/hrms/payroll`.

**Blocked until approval:** All salary calculations, deduction computations, payslip generation, statutory compliance logic.

---

## OD-009: Certificate Eligibility Rules *(Baseline D-07 partial, D-09)*

**Question:** Who is eligible for an internship certificate? What is the normal internship duration, extension policy, early-exit process, and certificate eligibility checklist? Who is the certificate signatory? What exact fields, issue-number pattern, corrections/reissue process, and public verification data are approved?

**Why it matters:** Certificate eligibility must be clear and defensible. Issuing certificates incorrectly damages credibility. Signatory must be verifiable.

**Affected modules:** `certificates`, `internship-evaluation`

**Safe work that can proceed:** Certificate template design, QR code generation mechanism, verification endpoint scaffolding, PDF service interface.

**Status Update (Prompt 6):** Implemented `InternCompletion` and `Certificate` models, pure TypeScript vector PDF generator (`VectorPdfBuilder` / `CertificatePdfGenerator`), server actions (`recordCompletionChecklistAction`, `issueCertificateAction`, `reissueCertificateAction`), and public verification endpoint (`/verify/[code]`). Certificate generation is strictly policy-gated: requires an authorized `ADMIN` or `HR` role, an approved completion checklist (`status === APPROVED`), and explicit eligibility confirmation (`isEligibleForCertificate: true`). Idempotency is enforced so repeated requests do not duplicate certificates. Public verification strictly redacts all internal evaluation scores, mentor notes, applicant IDs, and candidate contact details. Reissues are tracked with mandatory justification in `CertificateReissueHistory`.

**Blocked until approval:** Official signatory named assignment, final printed certificate layout approval, statutory eligibility duration thresholds.

---

## OD-010: Data Retention and Archival Policy *(Baseline D-06)*

**Question:** What is the retention period and deletion/anonymization policy for rejected applications and candidate documents? Who can access archived records? What about employee data retention after exit?

**Why it matters:** Retaining too much data creates privacy/legal risk. Deleting too early loses legally required records.

**Affected modules:** All modules handling personal data

**Safe work that can proceed:** Schema design supporting soft deletion and archival flags.

**Blocked until approval:** Automated retention enforcement, anonymization procedures, data purge jobs, candidate data deletion workflows.

---

## OD-011: Chatbot AI Provider and Scope *(Baseline D-18)*

**Question:** Which AI provider/model is approved for the chatbot? Which FAQ/policy documents are authoritative? What is the fallback when AI is unavailable? What data types may be sent to the provider?

**Why it matters:** Sending candidate/employee PII to an unapproved AI provider creates privacy and compliance risk.

**Affected modules:** `chatbot`, `infrastructure/ai`

**Safe work that can proceed:** Chatbot UI scaffolding, adapter interface design, approved static FAQ content, FAQ/help foundation.

**Status Update (Prompt 9):** Implemented replaceable `AiProviderAdapter` interface (`src/infrastructure/ai/ai-provider.interface.ts`), versioned approved FAQ knowledge base (`v1.0.0` in `src/infrastructure/ai/faq-knowledge-base.ts`), and `PortalAssistantProvider` (`src/infrastructure/ai/portal-assistant-provider.ts`) with prompt-injection defense, out-of-scope refusal, PII redaction (`sanitizeQueryForAiProvider`), and graceful fallback when an external AI model fails or is unconfigured. Implemented `ChatbotService` (`src/features/chatbot/services/chatbot-service.ts`) with strict server-side authorization (`user.id`) for personal status queries, blocking all cross-candidate status lookups with `ForbiddenError` and never sending resumes, employee files, payroll data, or private evaluation notes to an AI provider. No external paid or free LLM model has been selected or activated without approval.

**Blocked until approval:** External AI model selection/credentials, retention policy for external AI interactions.

---

## OD-012: Email Provider Selection *(Baseline D-15)*

**Question:** Which email provider/domain will be used? What sender/from address is authorized? Nodemailer is confirmed as the transport library.

**Why it matters:** Provider choice affects deliverability, cost, rate limits, and sender reputation. The adapter pattern isolates this, but a provider must be selected for production testing.

**Affected modules:** `infrastructure/email`, `notifications`

**Safe work that can proceed:** Nodemailer adapter with configurable SMTP settings, email templates, delivery-state tracking.

**Blocked until approval:** Production email configuration, deliverability testing, sender domain verification.

---

## OD-013: File Storage Provider *(Baseline D-16)*

**Question:** Which production object-storage provider will be selected? What file limits and retention rules apply?

**Why it matters:** Private documents need secure, access-controlled storage with time-limited URLs. Provider choice affects cost and implementation.

**Affected modules:** `infrastructure/storage`, `applications`, `employees`, `certificates`

**Safe work that can proceed:** Storage adapter interface with upload/download/signed-URL contracts. Safe local development implementation.

**Status Update (Prompt 3):** `StorageService` interface and `LocalStorageService` implemented under `src/infrastructure/storage/`. Files are strictly written to `.storage/private/` outside `public/`. A production runtime assertion throws an error if local storage is invoked in production, preventing accidental deployment without an approved cloud object store.

**Blocked until approval:** Provider-specific implementation, production storage configuration, file retention rules.

---

## OD-014: Onboarding and Intern ID Card *(Baseline D-08)*

**Question:** What onboarding documents, verification checks, ID-card fields/number format, issuer, and validity rules are required?

**Why it matters:** Onboarding checklists and ID cards require specific approved fields. Inventing ID number formats or required documents creates incorrect records.

**Affected modules:** `onboarding`, `employees`, `certificates`

**Safe work that can proceed:** Onboarding checklist data structure, ID card record schema.

**Status Update (Prompt 5):** Implemented `InternOnboarding` and `InternIdCard` models along with UI panels and server actions (`updateOnboardingItemAction`, `issueIdCardAction`). The system strictly gates ID card generation: it requires evaluation status `PASSED`, all required onboarding checklist items verified (`COMPLETED`), and an authorized `ADMIN` or `HR` role. ID cards are never issued prematurely merely because 7 days elapsed.

**Blocked until approval:** Final ID card printable card layout/PDF template, formal ID numbering series specification, digital signature approval.

---

## OD-015: Employee Lifecycle Policies *(Baseline D-13)*

**Question:** What are the department, designation, reporting manager, probation, employee review, transfer, and exit/offboarding policies?

**Why it matters:** Employee lifecycle management requires clear policies for transitions, probation periods, and exit procedures. Inventing these creates incorrect HR workflows.

**Affected modules:** `employees`, `onboarding`

**Safe work that can proceed:** Basic employee profile schema, department/designation data structures, job offer terms tracking without salary deduction engine.

**Status Update (Prompt 7):** Implemented `Employee`, `EmploymentHistory`, `JobOffer`, `EmployeeDocument`, `EmployeePerformanceReview`, and `EmployeeExitRecord` models and service layers under `src/features/employees/`. Full-time recruitment proceeds independently from internship-only 7-working-day evaluation. Gated hiring requires explicit application status `OFFER_ACCEPTED` and `ADMIN` or `HR` authorization. Created employee directory with strict data isolation (confidential phone numbers, emergency contacts, and internal notes are never exposed in public views). Implemented reporting line assignments with circular reporting hierarchy detection. Zero attendance, leave, or payroll calculations were implemented (strictly preserving OD-005, OD-006, and OD-007).

**Blocked until approval:** Formal statutory benefits, performance scoring formulas, statutory deduction formulas, and official clearance sign-off matrices.

---

## OD-016: Configurable Progress Monitoring Settings *(Baseline D-14)*

**Question:** What exact progress reports and task review settings can administrators configure? Which changes apply to an already-running programme?

**Why it matters:** Building a fixed monitoring system may not match organizational needs. Retroactive configuration changes could invalidate in-progress evaluations.

**Affected modules:** `progress`, `intern-tasks`, `reports`

**Safe work that can proceed:** Basic task CRUD, assignment, and status tracking.

**Status Update (Prompt 6):** Implemented `InternTask`, `TaskSubmission` (with incremental versioning and change-request feedback), and `ProgressReport` with configurable cadences (`WEEKLY`, `BIWEEKLY`, `MILESTONE`, `CHECKPOINT`) under `src/features/intern-tasks/`. Interns can submit deliverables and report progress with achievements, learnings, and blockers; supervisors can review submissions and request revisions with change notes. No work-hour metrics or performance calculations were assumed or hardcoded (preserving OD-005).

**Blocked until approval:** Dynamic custom report template builder, programme-level automated cadence reminder schedules.

---

## OD-017: Production Infrastructure *(Baseline D-17)*

**Question:** Which production hosting target, PostgreSQL provider, backup/restore objective, and background worker/scheduler will be used?

**Why it matters:** Production infrastructure choices affect reliability, cost, and operational procedures. Background job processing needs a durable solution (not in-memory).

**Affected modules:** All (deployment), `infrastructure/jobs`

**Safe work that can proceed:** Application development with environment-based configuration. Job adapter interface.

**Blocked until approval:** Production deployment configuration, backup/restore procedures, background worker implementation.

---

## OD-018: GARA Logo and Brand Assets *(Baseline D-19)* — **[RESOLVED ✅]**

**Status:** Resolved on 12 October 2026. The product owner supplied the official GARA logo assets at `public/GARA_LOGO.jpg` and `public/GARA_LOGO.png`.

**Decision & Rule:** Use the exact approved asset without redrawing, recoloring, regenerating, or altering the logo mark. Copy to `public/brand/` as canonical brand assets during foundation initialization. (2026-10-24: the root-level `public/GARA_LOGO.*` files were removed as byte-identical duplicates of `public/brand/gara-logo.*`, which remain the canonical copies.)

---

## OD-019: Roles and Permission Matrix *(Baseline D-20)*

**Question:** Confirm exact roles and permission matrix for recruitment staff, interviewers, HR, coordinators, mentors, interns, employees, and super administrators.

**Why it matters:** Authorization is the primary security control. Without a confirmed matrix, role-based access checks may be too permissive or too restrictive.

**Affected modules:** `auth`, all feature modules with authorization

**Safe work that can proceed:** Role constants, auth guard infrastructure, basic candidate/admin distinction.

**Blocked until approval:** Production permission matrix, granular access control per module.

---

## OD-020: Offer Preparation and Acceptance *(Engineering-identified)*

**Question:** What is the offer workflow? What fields appear on an offer? Who authorizes offer creation and extension? What are acceptance/rejection deadlines? Are there salary/compensation fields, and if so, who approves them?

**Why it matters:** Offers are legally and financially significant. The system must not generate offer terms from invented rules.

**Affected modules:** `recruitment`, `employees`, `notifications`

**Safe work that can proceed:** Offer status tracking data structure.

**Blocked until approval:** Offer creation form fields, authorization rules, deadline enforcement, compensation-related fields.

---

## Remediation Follow-ups (2026-10-24)

> Recorded during the security and correctness remediation (see `docs/SECURITY_REMEDIATION_CHECKLIST.md`).
> Product-owner decision of 2026-10-24: business rules that had been implemented without approval are **policy-gated** (removed or blocked) until approved. Each entry below states the behaviour that is now in the code.

### Policy-gated rules (previously implemented without approval)

| Ref | Rule that was in code | Current behaviour | Decision needed |
|---|---|---|---|
| OD-005 | Second application to the same opening rejected | Allowed; submissions rate-limited (5/hour per user) | Duplicate-application policy |
| OD-007 | Leave quotas CL 12 / SL 10 / PL 15 / parental 30 / bereavement 5 and computed balances | Removed; UI states the balance policy is pending | Leave entitlements and accrual |
| OD-008 | Default stipend ₹25k (intern) / ₹45k (full-time), ₹35k report default, placeholder bank/IFSC/PAN, auto-created payroll periods, generated "UTR" references | Removed; unset values show "Not configured", periods created only by staff, references entered by staff | Payroll scope, amounts, payout data model |
| OD-020 | Offer form defaults ("3 months" probation, working hours, location) | Empty fields | Offer fields and wording |
| OD-020 | Declined offer withdraws the application | Decline recorded on the offer only | What happens to the application after a decline |
| OD-015 | Exit clearance auto-set to `CLEARED` | Stays `PENDING` | Clearance sign-off matrix |
| OD-003 / OD-020 | Evaluation finalize auto-sets OFFERED / REJECTED and grants the INTERN role | Outcome recorded only; no status or role change | When the INTERN role is granted and how evaluation outcomes drive the application |
| OD-003 | Evaluation outcome `EXTENDED` | Blocked (`PolicyBlockedError`) | Extension policy |
| OD-004 | Interview scheduling / feedback auto-advance the application stage | Staff transition stages explicitly | Fixed round workflow and auto-advancement |
| OD-006 | Rejected attendance regularization forces `ABSENT` | Removed | Regularization outcome rules |
| OD-014 | ID card number series `GARA-INT-2026-…` | Provisional neutral format `IDC-<random>`; re-issue requires a reason | Official ID numbering series |
| OD-013 | Employee document "upload" stored metadata only (no file) | Blocked until a storage provider is approved | Storage provider (also blocks resume upload in production) |

### Safety gates added pending approval

| Ref | Gate | Why |
|---|---|---|
| OD-009 | Certificate issuance requires evaluation `PASSED`, an approved completion checklist validated on the server, and an explicitly typed signatory | The previous gate allowed certificates for failed or never-started interns |
| OD-019 | Staff need the matching granular permission flag in addition to their role; MENTOR / MANAGER / INTERVIEWER act on evaluations only for interns they supervise | The previous flags only hid navigation |
| OD-007 | A reviewer cannot approve their own leave request | Separation of duties; approval chains remain undecided |
| OD-015 | Direct employee creation (without an accepted offer) limited to ADMIN with a written justification | Contradicts the documented OFFER_ACCEPTED hiring gate |

### Open questions raised by the remediation

1. **Re-offers (OD-020):** `JobOffer.applicationId` is unique, so a declined or revoked offer cannot be followed by a new one; drafting now returns a conflict instead of deleting history. Should re-offers be supported (schema change)?
2. **Revoked offers (OD-020):** the application currently returns to the stage it had before the offer. Confirm.
3. **Feedback lock (OD-004):** interviewer feedback becomes read-only once the application reaches a decision stage. Confirm which stages lock it.
4. **Employee status transitions (OD-015):** PROBATION / ACTIVE / ON_LEAVE transitions are permissive; `EXITED` only via the exit flow. Confirm the matrix.
5. **Interviewer visibility (OD-019, checklist SEC-31):** staff holding `canApplications` see every application and all interview feedback. Should interviewers be limited to assigned applications?
6. **MENTOR application access (OD-019):** the recruitment service does not support MENTOR even when `canApplications` is granted; the page shows an "unavailable" notice.
7. **Default catalogues (POL-13):** the onboarding checklist, the completion checklist and the seeded leave-type catalogue were defined by engineering and need approval.
8. **Certificate presentation (OD-009):** the `GARA-CERT-YYYY-` code prefix and the "GARA Innovation Authority" label on the PDF need approval.
9. **Missing flow:** no screen enrols a selected candidate into the internship evaluation (`evaluationService.enrollCandidate` exists; its unused Server Action was removed on 2026-10-24 and should be re-added together with the screen). The same applies to recruiter assignment, interview reschedule/cancel, progress-report review and direct employee creation, whose services remain but whose unused actions were removed. (Intern checkpoint submission was added on the intern dashboard.) Should finalizing an evaluation require every checkpoint to be reviewed (OD-003)?
10. **Optional resume (OD-005 / OD-013):** when a form does not require a document, `resumeStorageKey` is stored as an empty string because the column is required; a nullable column needs a migration.
11. **Overlapping payroll periods (OD-008):** period creation only enforces a unique code; two periods with overlapping dates could each enrol and pay the same employee. Should overlaps be rejected?
12. **Per-record payroll voiding (OD-008):** a FINALIZED period cannot complete if an employee is switched to Unpaid before disbursement. Should staff be able to void a single record?
13. **Attendance regularization (OD-006):** request/review service methods exist but no action or screen exposes them; correction and approval rules are undecided.
14. **Payout data model (OD-008):** payout details still live in a reserved block inside `Employee.internalNotes`. A dedicated, encrypted payout table is recommended once the payroll scope is approved.
15. **MANAGER scope (OD-019):** managers with `canApplications` still read every application; interviewer scoping was applied because `docs/SECURITY.md` defines it, but no equivalent rule exists for managers.

### Resolved by the product owner (2026-10-24)

- **Tests stay local:** `tests/` is excluded from Git again (`.gitignore`), reversing the earlier inclusion; the suite runs locally with `npm test` and is not available to CI.
- **Single environment file:** keep one gitignored `.env` with every variable; no `.env.example`. This overrides the `.env.example` instruction in `docs/PROJECT_BASELINE.md` (rules 12 and the Prompt 0 checklist). The variable reference is `docs/RUNBOOK.md` section 2.

### Resolved by the product owner (2026-10-25): candidate-to-employee lifecycle

- **Public signup:** open to anyone, but it always creates a CANDIDATE account and asks what the person is looking for (`CandidateProfile.careerInterest`: job, internship or both). Staff, HR and admin accounts are created only by administrators.
- **Internship role grant (resolves the INTERN-role part of OD-003 / OD-020):** two steps. Selection for the 7-working-day evaluation unlocks the evaluation workspace while the person is still a candidate; evaluation PASSED plus HR "Mark as joined" grants the INTERN role (attendance, leave, payslips, ID card, certificate).
- **Full-time role grant:** an accepted offer plus HR "Mark as joined" grants the EMPLOYEE role (employee home, attendance, leave, payslips).
- **After joining:** candidate features (explore openings, apply, candidate dashboard) are hidden and applications stay visible as read-only history; joined users and staff cannot submit new applications.
- Stage rules live in `src/features/lifecycle/capabilities.ts`; see `docs/CANDIDATE_LIFECYCLE.md`.

### Lifecycle follow-ups (2026-10-25) — resolved the same day (round 3)

1. ~~Re-joining after exit~~ → **Resolved:** people re-join through normal hiring with the same account; HR "Mark as joined" reuses the same Employee row and employee code and opens a new `EmploymentPeriod` (REJOINED). Earlier periods remain as history.
2. ~~Intern → full-time conversion~~ → **Resolved:** HR chooses a progress review after 3 or 6 months at intern joining; the review outcome is CONVERT, EXTEND or END_INTERNSHIP; CONVERT creates an offer the intern accepts in the portal, and the conversion takes effect automatically on the effective date (FULL_TIME period, EMPLOYEE role).
3. ~~Supervisor reassignment~~ → **Resolved:** the evaluation cockpit has a "Change supervisor" action while the evaluation is not finalized.

### Resolved by the product owner (2026-10-25, round 3)

- **Documents (interim for OD-013):** candidates share their resume as an https link (e.g. Google Drive) until the organisation runs its own storage server; uploads remain available behind `DOCUMENT_STORAGE_MODE=local`.
- **Automation without Vercel Cron:** interview, evaluation and conversion-review reminders plus a staff daily digest run on the app's own job system and are sent through the organisation's SMTP account.

### Behaviour implemented in round 3 that needs confirmation

1. A re-join removes the other joining role (a former employee re-joining as an intern becomes INTERN only), so the portal matches the new period.
2. When someone exits, scheduled intern reviews are cancelled and open conversion offers (pending, or accepted but not yet effective) are withdrawn.
3. After an intern declines a conversion offer no further review is scheduled automatically; HR can record a new outcome only through a new review.
4. There is no action yet to withdraw a pending conversion offer or to reschedule a review date.
5. Daily reminders that run late (after their business day) are skipped rather than sent a day late; missed days are not backfilled.

### Approved by the product owner (2026-10-25, round 4)

Calendar invites (.ics), interview self-scheduling, offer letter PDF with electronic acceptance, hiring funnel analytics, bulk actions with templated emails, Google Jobs structured data, storage-server readiness (private uploads with virus scanning) and Playwright end-to-end tests.

### Behaviour implemented in round 4 that needs confirmation

**Interview self-scheduling (OD-004)**

1. Managers and interviewers can only name themselves as the interviewer on a booking request; HR and Admin can pick anyone.
2. One pending booking request per application round is enforced in the service only; a database-level guarantee needs a partial unique index (migration).
3. Closing an application does not withdraw its pending booking requests; they are hidden from the candidate and booking is refused.
4. If the interviewer on a request loses their staff role, booking is refused and the candidate is asked to contact the hiring team.
5. Reasons that staff enter when withdrawing, rescheduling or cancelling are shown to the candidate (unchanged from the existing interview emails).
6. When a request has no interviewer, no staff member is emailed when the candidate books.
7. Calendar invites carry https meeting links only; an http link still appears in the email body.

**Offer letter and electronic acceptance (OD-020)**

8. The offer reference printed on the letter is the application reference code (one offer per application); no separate offer numbering series exists.
9. Staff letter downloads are limited to HR or Admin with `canEmployees` (the same rule as offer visibility); managers with `canEmployees` are refused.
10. The rupee sign is printed as "Rs." because the built-in PDF fonts lack the glyph; embedding a Unicode font is a separate decision.
11. Letter dates use `APP_TIMEZONE`. Changing it changes the bytes of regenerated letters, so the staff card reports that the current letter differs from the accepted one; the stored hash still identifies what was accepted.
12. **Legal sufficiency of a typed-name signature is not decided.** The evidence kept (typed name, time, hashed IP, user agent, SHA-256 of the exact letter) is described in `docs/SECURITY.md`; confirm with counsel whether it is adequate or a qualified e-signature provider is required.

**Source tracking and analytics (OD-019)**

13. The mapping of campaign values to sources (for example `lnkd` → LinkedIn) in `src/features/applications/source-tracking.ts` was written by engineering. The candidate's own answer takes precedence over link parameters.
14. Funnel "time to hire" counts calendar days from submission to the `HIRED` stage.

**Google Jobs structured data**

15. Openings have no published or closing date, so `datePosted` uses the creation date and `validThrough` is omitted; there is no salary field, so `baseSalary` is omitted. Adding these needs a schema change.
16. Location is free text; `addressCountry` is set only when the location reads "City, Region, Country".

**Engineering follow-ups**

17. The application list pages paginate 50 rows per page on the page after loading the queue; moving pagination into the recruitment queue query is recommended as volume grows.
18. The application source is not yet shown on the application detail page.
19. The application form caps resume uploads at 5 MB while local storage accepts up to 10 MB; the form limit applies.

### Staff workspaces (2026-10-25) — needs confirmation

20. The manager overview lists direct reports from the reporting line on employee records and shows their leave and check-in only when the manager holds the leave or attendance permission. The leave and attendance queues themselves still show every employee to managers holding those permissions; whether managers should act only on their own team is part of open question 15 above (OD-019).
21. HR sees the whole day's interview schedule instead of a separate "My interviews" list; interviews HR runs appear in that schedule.
