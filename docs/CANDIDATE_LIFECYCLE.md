# Candidate-to-Employee Lifecycle — GARA Innovation Platform

> Product-owner decisions of 2026-10-25 (recorded in `docs/OPEN_DECISIONS.md`). Rules live in
> `src/features/lifecycle/capabilities.ts`; the resolver in `src/features/lifecycle/services/lifecycle-service.ts`.

## 1. Stages

| Stage | How a person gets there | Role | Home |
|---|---|---|---|
| `CANDIDATE` | Public signup (choosing job, internship or both) or Google sign-in | none (treated as CANDIDATE) | `/candidate/dashboard` |
| `EVALUATION` | Staff select an internship application for the 7-working-day evaluation (an enrollment exists, status PENDING_TRIGGER → PASSED) | none | `/candidate/dashboard` (+ evaluation workspace) |
| `INTERN` | Evaluation PASSED, then HR **Mark as joined** | `INTERN` | `/intern/dashboard` |
| `EMPLOYEE` | Offer accepted, then HR **Mark as joined** | `EMPLOYEE` | `/hrms` |
| `ALUMNI` | The employment record is `EXITED` | unchanged | `/candidate/applications` |

A failed evaluation returns the person to `CANDIDATE`. Staff (ADMIN, HR, MANAGER, INTERVIEWER, MENTOR) never use the self-service portal; they land on `/admin` or `/subadmin`.

## 2. What each stage can use

| Capability | Candidate | Evaluation | Intern | Employee | Alumni |
|---|:-:|:-:|:-:|:-:|:-:|
| Candidate dashboard, recommended openings | ✓ | ✓ | | | |
| Explore openings and **apply** | ✓ | ✓ | | | |
| Applications | manage | manage | read-only "My Journey" | read-only "My Journey" | read-only |
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
3. **Full time — Mark as joined** — application detail after the candidate accepted the offer: same permissions and fields; sets `employmentType = FULL_TIME`, grants `EMPLOYEE` with a fresh `assignedAt`, queues `EMPLOYEE_JOINED`.

The role's `assignedAt` drives the in-portal "Welcome to the GARA team" banner for 14 days (dismissible per browser).

## 4. Data model

- `CandidateProfile.careerInterest` (`JOB | INTERNSHIP | BOTH`, nullable): set at signup, editable on the profile; drives recommended openings (`JOB → FULL_TIME`, `INTERNSHIP → INTERNSHIP`, `BOTH`/unset → both).
- `Employee.employmentType` (`FULL_TIME | INTERN`, nullable for records created before 2026-10-25).
- Migration: `prisma/migrations/20261025000000_candidate_lifecycle` (additive). Apply it before deploying code that uses it — see `docs/RUNBOOK.md` §4.1 for the Neon direct-endpoint command.

## 5. Open questions

Tracked in `docs/OPEN_DECISIONS.md` ("Lifecycle follow-ups"): re-joining after exit, intern → full-time conversion, and reassigning an evaluation supervisor.
