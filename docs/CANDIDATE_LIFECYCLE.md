# Candidate-to-Employee Lifecycle — GARA Innovation Platform

> Product-owner decisions of 2026-10-25 (recorded in `docs/OPEN_DECISIONS.md`). Rules live in
> `src/features/lifecycle/capabilities.ts`; the resolver in `src/features/lifecycle/services/lifecycle-service.ts`.

## 1. Stages

| Stage | How a person gets there | Role | Home |
|---|---|---|---|
| `CANDIDATE` | Public signup (choosing job, internship or both; email verified with an emailed code) or Google sign-in | none (treated as CANDIDATE) | `/candidate/dashboard` |
| `EVALUATION` | Staff select an internship application for the 7-working-day evaluation (an enrollment exists, status PENDING_TRIGGER → PASSED) | none | `/candidate/dashboard` (+ evaluation workspace) |
| `INTERN` | Evaluation PASSED, then HR **Mark as joined** | `INTERN` | `/intern/dashboard` |
| `EMPLOYEE` | Offer accepted, then HR **Mark as joined** | `EMPLOYEE` | `/hrms` |
| `ALUMNI` | The employment record is `EXITED` | unchanged | `/candidate/dashboard` (candidate features + history) |

A failed evaluation returns the person to `CANDIDATE`. Staff (ADMIN, HR, MANAGER, INTERVIEWER, MENTOR) never use the self-service portal; they land on `/admin` or `/subadmin`.

## 2. What each stage can use

| Capability | Candidate | Evaluation | Intern | Employee | Alumni |
|---|:-:|:-:|:-:|:-:|:-:|
| Candidate dashboard, recommended openings | ✓ | ✓ | | | ✓ |
| Explore openings and **apply** | ✓ | ✓ | | | ✓ (re-join) |
| Applications | manage | manage | read-only "My Journey" | read-only "My Journey" | manage |
| Evaluation workspace (tasks, checkpoints, progress reports) | | ✓ | ✓ (record) | | |
| Intern workspace, ID card, certificate | | | ✓ | | certificate |
| Employee home | | | | ✓ | |
| Attendance, leave, payslips (own records) | | | ✓ | ✓ | |
| Profile, help | ✓ | ✓ | ✓ | ✓ | ✓ |

Enforcement:
- Navigation is generated from the capabilities, so hidden features never appear in the menu or the header shortcuts.
- Every self-service page starts with `requirePortalCapability(...)`; a missing capability redirects to the stage home.
- `submitApplicationAction` refuses joined users and staff (`getApplyBlockedReason`), independent of the UI.

## 3. Staff-side transitions

1. **Select for 7-day evaluation** — internship application detail (admin / sub-admin): ADMIN or HR with `canEvaluations`, required supervisor, never one's own application. Creates the enrollment and moves the application to `EVALUATION_SELECTED` (a flow-owned status the generic stage dialog cannot reach). Queues the evaluation-selection email.
2. **Intern — Mark as joined** — evaluation cockpit, only when the evaluation is `PASSED`: ADMIN or HR with `canEmployees`. HR enters employee code, department, designation, joining date (not in the future), initial status (ACTIVE or PROBATION, no default) and an optional manager. One transaction creates the `Employee` (`employmentType = INTERN`), moves the application `EVALUATION_SELECTED → HIRED`, writes stage/employment/audit history, grants `INTERN` with a fresh `assignedAt`, and queues `INTERN_JOINED`.
3. **Full time — Mark as joined** — application detail after the candidate accepted the offer (the candidate downloads the offer-letter PDF and accepts it by typing their full name; the acceptance stores e-signature evidence, see `docs/SECURITY.md`): same permissions and fields; sets `employmentType = FULL_TIME`, grants `EMPLOYEE` with a fresh `assignedAt`, queues `EMPLOYEE_JOINED`.

The role's `assignedAt` drives the in-portal "Welcome to the GARA team" banner for 14 days (dismissible per browser).

Candidates with a pending interview booking request see it on their dashboard and pick one of the offered slots at `/candidate/interviews/<requestId>`; the confirmed interview arrives with a calendar invite.

## 4. Employment periods, re-joining and conversion

- Every joining opens an `EmploymentPeriod` (JOINED, REJOINED or CONVERTED); an exit closes the current period and links the exit record to it. The Employee row and employee code are reused across periods, so attendance, leave and payroll history stay on one record; past periods are shown as a timeline to staff and to the person.
- **Re-joining:** an alumni applies again; HR "Mark as joined" on the new application reuses the EXITED record (same code, read-only) and opens a REJOINED period. Records that are still active are refused.
- **Intern → full time:** at intern joining HR chooses a progress review after 3 or 6 months. On the Intern Reviews board (`/admin/intern-reviews`, `/subadmin/intern-reviews`) HR records CONVERT (proposed designation, department, effective date, initial status), EXTEND (next review after 3 or 6 months) or END_INTERNSHIP (then processes the exit). The intern accepts or declines a CONVERT offer in their workspace; on the effective date the `CONVERSION_EFFECTIVE` job converts them (FULL_TIME period, EMPLOYEE role, INTERN role removed).
- **Supervisor change:** the evaluation cockpit can reassign the supervisor until the evaluation is finalized.

## 5. Automation

Own job system (`docs/RUNBOOK.md` §5.5): interview reminders 24 h and 1 h before; daily checkpoint reminders for interns and reviewers (09:00); conversion-review reminders 7 days ahead, on the day and when overdue (09:00); staff daily digest (09:30) built from each person's Action Center. The Action Center ("Needs your attention") on the admin and sub-admin overviews lists pending screening, feedback, evaluations, joinings, offers, intern reviews, conversions and leave/regularization requests, scoped to each viewer's permissions.

## 6. Data model

- `CandidateProfile.careerInterest` (`JOB | INTERNSHIP | BOTH`, nullable): set at signup, editable on the profile; drives recommended openings (`JOB → FULL_TIME`, `INTERNSHIP → INTERNSHIP`, `BOTH`/unset → both).
- `Employee.employmentType` (`FULL_TIME | INTERN`, nullable for records created before 2026-10-25).
- Migration: `prisma/migrations/20261025000000_candidate_lifecycle` (additive). Apply it before deploying code that uses it — see `docs/RUNBOOK.md` §4.1 for the Neon direct-endpoint command.

- Round 3 (`20261026000000_employment_periods_jobs`): `EmploymentPeriod`, `ConversionReview`, `ScheduledJob`, `Application.resumeUrl`, per-period `EmployeeExitRecord`, `NotificationOutbox.dedupeKey`, performance indexes; backfills one period per existing employee.
- Round 4 (`20261027000000_scheduling_esign_sources`, additive): `InterviewBookingRequest` / `InterviewSlotOption` (candidate self-scheduling), `InterviewSchedule.icsSequence` (calendar updates), `JobOffer` e-signature evidence, `Application.source` / `sourceDetail`.

## 7. Staff workspaces

Administrators use `/admin`. Every other staff role lands on `/subadmin`, whose overview is built for the role (`src/features/staff-dashboard`). Someone holding several roles sees each of their workspaces, most senior first; every section also needs the matching module permission.

| Workspace | Sections (after "Needs your attention") |
|---|---|
| HR | Hiring pipeline by stage, today's interviews (all interviewers), internship evaluations by status, who is on approved leave today, interns they supervise (if any) |
| Manager | Direct reports with today's leave and check-in (leave/attendance shown only with those permissions), interviews they run, interns they supervise (if any) |
| Interviewer | Their interviews today and the next 7 days with join links and "Feedback due" markers, interns they supervise (if any) |
| Mentor | Interns they supervise with checkpoints, task submissions and progress reports waiting for review |

All staff with a non-exited employee record also see their own check-in and leave on the overview. Navigation and the "Your modules" list show only modules the person can open: the permission plus the role the module requires (applications and interviews need a recruitment role, payroll needs HR), so a mentor is never offered a page that refuses them.

Registrations are visible to staff with the reports permission on the **Registrations** tab of Reports (and a summary card on the admin overview): sign-ups by what people chose (job, internship, both, not chosen), verified or not, applied or not yet, daily and monthly trends, sign-up → first application conversion. The candidate profile, including the choice, is created when the account is created, so people who never verify their email are counted too. Names and emails are shown only to administrators and HR.

## 8. Open questions

Tracked in `docs/OPEN_DECISIONS.md` ("Behaviour implemented in round 3 that needs confirmation" and the round 4 equivalent).
