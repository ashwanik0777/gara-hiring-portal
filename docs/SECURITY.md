# Security — GARA Innovation Platform

> **Status:** Security policy documentation. Implementation occurs during approved development phases.

---

## 1. Threat Surface Overview

The GARA platform handles sensitive data across multiple user types. Key threat areas:

| Threat Area | Risk Level | Data at Risk |
|---|---|---|
| Authentication bypass | Critical | All user accounts and data |
| Authorization escalation | Critical | Admin functions, employee records, payroll |
| Candidate data exposure | High | Resumes, contact info, identity documents |
| Employee data exposure | High | Salary, attendance, leave, ID documents |
| File access bypass | High | Private documents served publicly |
| Injection attacks (SQL, XSS) | High | Database integrity, user sessions |
| CSRF on state-changing actions | High | Application status, approvals, payroll |
| Certificate forgery/tampering | High | Verification integrity |
| API abuse / rate limiting | Medium | Service availability, brute-force attacks |
| Information disclosure via errors | Medium | Internal architecture, database schema |

---

## 2. Authentication

### Supported Methods (Initial)

1. **Email/Password** — Better Auth scrypt-hashed passwords, minimum complexity requirements
2. **Google OAuth** — via approved OAuth library

> **No other social providers** until explicitly approved by the product owner.

### Authentication Rules

- Passwords must be hashed with a strong adaptive algorithm (bcrypt with appropriate cost factor, or argon2).
- Never store plaintext passwords, OTPs, or session tokens in logs.
- Password reset tokens must be single-use, time-limited, and securely random.
- OAuth callback URLs must be explicitly configured and validated. OAuth login must not automatically grant company roles.
- Account linking (email/password + Google for same email) must be deliberate and documented.
- Session cookies must use `httpOnly`, `secure`, `sameSite=lax` (or `strict` where appropriate) flags.
- Session expiry and revocation strategy must be documented before deployment.
- Support logout from all devices (session invalidation).

### Rate Limiting

| Endpoint | Limit (Proposal) | Notes |
|---|---|---|
| `/login` | 5 attempts / 15 min per IP | Lock account after N failures (N to be decided) |
| `/register` | 3 registrations / hour per IP | Prevent mass account creation |
| `/forgot-password` | 3 requests / hour per email | Prevent email flooding |
| `/api/verify/*` | 30 requests / min per IP | Prevent enumeration |
| File upload endpoints | 10 uploads / min per user | Prevent storage abuse |
| Chatbot endpoints | 20 requests / min per user | Prevent AI cost abuse |

> Exact limits to be calibrated during testing. Implement configurable rate limiting.

### Implemented Authentication Controls (2026-10-24)

- **Password reset** uses Better Auth's token flow: `/forgot-password` → single-use link valid for 1 hour → `/reset-password`. The response does not reveal whether the account exists, the email is sent after the response, the current password keeps working until the reset completes, and all sessions are revoked on completion. No endpoint can overwrite a password without the emailed token.
- **Temporary passwords** exist only for administrator-created sub-admin accounts (`mustChangePassword`). `requireAuth()` rejects such sessions at every server boundary until `/set-password` succeeds; that action is only valid in this state and signs out other devices.
- **Post-login routing** is decided from the current session only (`getPostLoginRedirectAction`); no endpoint discloses another account's roles or state.
- **Callback URLs** are sanitized to same-origin relative paths (`sanitizeCallbackPath`), including backslash and protocol-relative variants.
- **Trusted origins** are an explicit allow-list; localhost is trusted only outside production.
- **Rate limits**: Better Auth endpoints use database-backed storage (`rate_limits`); application code uses the advisory-locked Postgres limiter (`RATE_LIMIT_POLICIES`).
- **OAuth tokens** are encrypted at rest (`encryptOAuthTokens`).

---

## 3. Authorization

### Role-Based Access Control (RBAC)

Proposed role hierarchy (subject to product-owner approval):

| Role | Description | Access Scope |
|---|---|---|
| `CANDIDATE` | External job/internship applicant | Own applications, own profile |
| `INTERN` | Active intern | Own tasks, own progress, own evaluation |
| `EMPLOYEE` | Full-time employee | Own profile, own attendance, own leave, own payslips |
| `MENTOR` | Intern mentor/supervisor | Assigned interns' tasks and progress |
| `INTERVIEWER` | Interview panelist | Assigned interview schedules and feedback forms |
| `HR` | Human Resources staff | Recruitment, employee management, leave/attendance admin |
| `MANAGER` | Department/team manager | Team members' attendance, leave approvals |
| `ADMIN` | System administrator | Full system access, settings, audit logs |

### Authorization Rules

1. **Every Server Action and Route Handler must verify authorization** — not just authentication.
2. **Record-level ownership**: Candidates see only their own applications. Employees see only their own records. Interns see only their own tasks/evaluation.
3. **Role verification happens server-side**, close to the data operation. Never trust client-supplied role claims.
4. **Middleware redirects are UX, not security.** Even if middleware redirects unauthorized users, the Server Action/Route Handler must independently verify permission.
5. **Public signup creates `CANDIDATE` role only.** Elevation to any staff role requires admin action.
6. **Permission matrix must be documented and tested** — both positive (allowed) and negative (forbidden) cases.
7. **Granular module permissions are enforced on the server.** Staff roles (HR, MANAGER, INTERVIEWER, MENTOR) need the matching `SubAdminPermission` flag (`canApplications`, `canOpenings`, `canInterviews`, `canEvaluations`, `canEmployees`, `canAttendance`, `canLeave`, `canPayroll`, `canReports`) in addition to any role rule, via `requirePermission` / `assertPermission` (`src/lib/auth/guards.ts`). ADMIN holds every permission. A database error while resolving permissions denies access instead of falling back to role defaults.
8. **Pages authorize themselves.** Layout checks are navigation only; every page that loads protected data calls a guard.
9. **Errors returned to clients** pass through `toActionError` / `toSafeErrorResponse`; only operational `AppError` messages are shown, everything else is logged server-side.
10. **Staff removal revokes access instead of deleting the user**, preserving employment, attendance, leave and payroll history (`User → Employee` is `onDelete: Restrict`).

### Record-Level Access Examples

| Data | Who Can Read | Who Can Write |
|---|---|---|
| Candidate application | Candidate (own), HR, assigned interviewer | Candidate (own, pre-submit), HR |
| Interview feedback | HR, interviewer (own), admin | Interviewer (own, during window) |
| Employee salary | Employee (own), HR, admin | HR, admin |
| Attendance record | Employee (own), HR, manager (team) | System (clock-in/out), HR |
| Leave balance | Employee (own), HR, manager (team) | System (calculated) |
| Evaluation result | Intern (own), mentor, HR, admin | Mentor, HR |
| Certificate | Intern (own), public (verification only) | System (generated) |

---

## 4. Data Privacy & Document Security

### Classification

| Data Type | Classification | Storage |
|---|---|---|
| Public job listings | Public | Database, cached |
| Candidate contact info | Confidential | Database (encrypted at rest) |
| Resumes, cover letters | Confidential | Private object storage |
| Interview notes/scores | Confidential | Database |
| Employee PII (name, DOB, ID) | Confidential | Database (encrypted at rest) |
| Salary information | Highly Confidential | Database (encrypted at rest) |
| Payslips | Highly Confidential | Private object storage |
| Identity documents | Highly Confidential | Private object storage |
| Passwords, tokens | Secret | Hashed/encrypted, never logged |

### File Security Rules

1. **Private documents NEVER go in `public/`.** They use private object storage with access-controlled retrieval.
2. **File access requires authorization check + time-limited signed URL.** URLs expire after a short period (e.g., 15 minutes).
3. **File upload validation:**
   - Allowed MIME types (whitelist, not blacklist)
   - Maximum file size (configurable per upload type)
   - Filename sanitization (random/non-guessable keys in storage)
   - Virus/malware scanning (if applicable, documented as a future consideration)
4. **No permanent public URLs** for private documents.
5. **File names in storage must be random UUIDs**, not user-supplied filenames.

### Data Minimization

- Collect only approved fields. Do not add "nice to have" PII fields without approval.
- Display only the minimum data necessary for each screen and role.
- Public certificate verification returns: certificate ID, holder name, programme, dates, and verification status. No internal scores, evaluations, or personal documents.

---

## 5. Secrets Management

### Environment Variables

- All secrets (database URL, OAuth client secret, JWT secret, API keys) come from environment variables.
- A single local `.env` holds every variable (product-owner decision, 2026-10-24: no `.env.example`). The variable reference lives in `docs/RUNBOOK.md` section 2.
- `.env` and any other `.env*` file are **never committed.** They are in `.gitignore`.
- Environment variables are validated at startup using a schema (e.g., Zod). Missing required variables cause a startup failure with a clear message — not a silent runtime crash.

### What Must Never Be Logged

- Passwords (plaintext or hashed)
- Session tokens / JWTs
- OAuth access/refresh tokens
- OTPs / verification codes
- Full document contents
- Full credit card or bank numbers (not applicable yet, but as a rule)
- Stack traces in production API responses

### What Can Be Logged (with care)

- User ID (not PII like email/name in production logs)
- Action type and timestamp
- IP address (for rate limiting and abuse detection, with appropriate retention)
- Error codes (not full error messages with user data)

---

## 6. Input Validation & Injection Prevention

### Server-Side Validation (Security Control)

- Every Server Action and Route Handler validates input using schema validation (Zod).
- SQL injection is prevented by using parameterized queries (Prisma handles this).
- XSS is prevented by React's default escaping + not using `dangerouslySetInnerHTML` without sanitization.
- CSRF is handled by Next.js Server Actions' built-in CSRF protection.

### Client-Side Validation (UX Only)

- Client validation provides immediate feedback but is **never trusted** for security.
- All client-validated data is re-validated server-side.

### File Upload Validation

- MIME type whitelist (e.g., `application/pdf`, `image/jpeg`, `image/png`)
- File size limits enforced server-side
- File content type verification (not just extension)
- Implemented (2026-10-25, `src/infrastructure/storage/upload-policy.ts`): the declared type must match the file signature (`%PDF-`, JPEG SOI, PNG header); private uploads are capped at 10 MB.
- Virus scanning (`VIRUS_SCAN_MODE=clamav`, `src/infrastructure/storage/virus-scanner.ts`): every upload is streamed to clamd (`zINSTREAM`) before it is written. Infected files are rejected and logged as a warning (signature name, type and size, never the content); an unreachable or erroring scanner refuses the upload (fail closed). `checkProductionReadiness` blocks uploads without scanning.
- By default (`DOCUMENT_STORAGE_MODE=link`) no files are accepted at all: candidates submit an https share link, validated on the server.

---

## 7. High-Risk Workflow Actions

These actions require extra security scrutiny:

| Action | Security Requirements |
|---|---|
| Password change | Require current password verification |
| Email change | Require password verification + confirmation email to both old and new |
| Account deletion | Require password verification + confirmation step |
| Role elevation | Admin-only, audit logged |
| Application status change | Authorized role, valid transition, audit logged |
| Offer creation/withdrawal | Authorized role, audit logged |
| Certificate issuance | System-generated after authorized approval, audit logged |
| Certificate revocation | Admin-only, audit logged, old cert marked invalid |
| Payroll execution | Authorized role, audit logged, confirmation step |
| Bulk operations | Rate limited, audit logged, confirmation step |
| Bulk application stage changes | ADMIN/HR with `canApplications`, at most 100 per request, each item through the single-transition checks (allowed transition, self-dealing block, conditional write, history), one batch audit row plus per-item audit rows, confirmation dialog stating the count |
| Offer acceptance (e-signature) | Owner only, offer `EXTENDED` and application `OFFERED`, typed name must match the account name, letter hash must match, evidence stored atomically with the acceptance (see below) |

### E-signature Evidence (offer acceptance)

A candidate accepts an offer by typing their full name and ticking a consent box. In the same conditional update that marks the offer `ACCEPTED`, the server stores:

| Field | Content |
|---|---|
| `signedName` | The typed name (trimmed, whitespace collapsed); must equal the account name ignoring case and spacing |
| `signedAt` | Server time of acceptance |
| `signatureIpHash` | HMAC-SHA-256 of the client IP keyed with a purpose label and `BETTER_AUTH_SECRET` (`src/lib/security/client-ip.ts`); the raw IP is never stored. Rotating the secret makes old hashes non-reproducible, but they stay valid as recorded evidence |
| `signatureUserAgent` | The browser user agent with control characters removed, truncated |
| `signedDocumentHash` | SHA-256 of the exact offer-letter PDF bytes. The letter is generated deterministically; the page carries the hash of the letter the candidate reviewed, and acceptance is refused if the regenerated letter hashes differently (the offer changed in between) |

The status-history row records the hash, and the confirmation email shows its first 16 characters. Whether a typed-name signature is legally sufficient is an open decision (`docs/OPEN_DECISIONS.md`, round 4 item 12).

### Public Structured Data

Opening pages embed `JobPosting` JSON-LD. It is the only `dangerouslySetInnerHTML` in page content (besides the theme bootstrap script in the root layout), built from published openings only, with `<`, `>`, `&`, U+2028 and U+2029 escaped (`src/app/careers/_lib/seo.ts`); a unit test enforces both rules. `robots.txt` disallows portals, auth screens, APIs and apply forms.

---

## 8. Audit Trail

### What Must Be Logged

- Authentication events (login, logout, failed attempts)
- Authorization failures (access denied)
- Record creation, modification, deletion for sensitive data
- Status transitions (application pipeline, evaluation, leave approval)
- File uploads and access
- Certificate generation, issuance, and revocation
- Admin actions (role changes, settings changes)
- Bulk operations

### Audit Record Structure

| Field | Description |
|---|---|
| `id` | Unique audit event ID |
| `timestamp` | When the action occurred |
| `actor_id` | Who performed the action (user ID) |
| `actor_role` | Role at time of action |
| `action` | What was done (e.g., `APPLICATION_STATUS_CHANGED`) |
| `resource_type` | What was affected (e.g., `application`) |
| `resource_id` | ID of affected record |
| `details` | Structured metadata (old value → new value, etc.) |
| `ip_address` | Requester's IP |

### Retention

- Audit logs must be retained according to the approved retention policy (OD-011).
- Audit logs must not be deletable by the user whose actions they record.
- Audit log access is restricted to admin and authorized HR roles.

---

## 9. Data Retention & Deletion (POLICY-GATED)

> **Blocked:** Specific retention periods and deletion procedures require product-owner approval (OD-011).

### Principles (applicable once policy is defined)

- Define retention periods per data type.
- Implement soft-delete with configurable hard-delete after retention period.
- Support data anonymization as an alternative to deletion where required.
- Candidate data subject requests (deletion/export) must be supported.
- Never delete audit trail records before their own retention period expires.
- Database backups must follow the same retention schedule.

---

## 10. Third-Party & AI Security

### External Provider Rules

- No candidate or employee PII is sent to any external service without product-owner approval of:
  - The specific provider
  - The data types permitted
  - The provider's data retention and privacy policies
  - The data processing agreement (if applicable)

### Chatbot-Specific Rules

- The chatbot is restricted to approved GARA portal/programme information.
- Permission-checked personal data may be surfaced to the authenticated user only.
- The chatbot must not act as a general-purpose AI assistant.
- The chatbot must have documented fallback responses for out-of-scope queries.
- AI provider approval is blocked (OD-012).

### Dependency Security

- Monitor dependencies for known vulnerabilities (npm audit, Dependabot).
- Pin major versions. Review breaking changes before upgrading.
- Minimize the number of dependencies. Prefer well-maintained, widely-used packages.
