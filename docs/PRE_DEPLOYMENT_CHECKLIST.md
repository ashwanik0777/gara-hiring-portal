# Pre-Deployment Checklist — Testing Environment (2026-11-01)

> Status legend: **[x]** done and verified in the repository · **[ ]** owner action (cannot be done from the code) · **[~]** accepted limitation, tracked in `docs/OPEN_DECISIONS.md`.
> Evidence for the verification figures is in section 1; history of earlier rounds is in `docs/SECURITY_REMEDIATION_CHECKLIST.md`.

## 1. Verification run before deployment

| Check | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | Pass — 0 errors |
| Lint | `npm run lint` | Pass — 0 errors |
| Unit tests | `npx vitest run` | Pass — 41 files, 1284/1284 tests |
| Production dependencies | `npm audit --omit=dev` | 0 vulnerabilities (the 16 moderate advisories are in the ESLint dev toolchain only) |
| Production build (clean copy without `.env` and without secrets, as on Vercel) | `npm run build` | Pass (dependencies updated today: better-auth 1.7.14, Prisma 7.10.1, nodemailer 10.3.1) |
| End-to-end, public suite (desktop + 375 px) | `npm run test:e2e` | Dev server: pass. Production build: 45 passed, 0 failed (17 skipped: database-only and dev-only checks) |
| End-to-end, both hiring journeys on a real Postgres (local PGlite test database) | `E2E_DATABASE_URL=… npm run test:e2e` | 54 passed, 0 failed — both journeys pass without retries on a freshly migrated database |
| Migrations on an empty database | `prisma migrate deploy` (PGlite) | All 7 migrations apply cleanly |

The two journeys exercise the complete flows with a real database: sign-up with emailed code, profile, application, screening, shortlist, interview, evaluation selection → start → pass → mark as joined (intern portal unlocked), and offer → electronic acceptance → mark as joined (employee portal).

### Update 2026-11-18 — link previews, pages without JavaScript, Next.js security patch

- [x] **Link previews:** every public page now has Open Graph and X card tags in the server HTML (home had none) with a 1200×630, ~60 KB generated image (`og:image` was a 1 MB logo, only on `/careers`); each opening gets its own image with its title. Checked as WhatsApp and LinkedIn would fetch it.
- [x] **Content without JavaScript:** public and sign-in pages no longer start as a "Loading" placeholder; their content is in the first HTML response (removed their `loading.tsx` boundaries; query strings are read in the browser). The careers page shows a short message instead of an error screen when openings cannot be loaded; apply links work without JavaScript.
- [x] **Next.js 16.4.3 → 16.4.6** (and `eslint-config-next`): fixes GHSA-mfr8-8qww-v76h and GHSA-vc7v-qv4w-wrv8 (cache leaks across root params in `"use cache"`). The 16.4.3 build stopped with this advisory.
- [~] **Test tooling only:** `picomatch` ≤ 4.0.7 (ReDoS, GHSA-fc5q-39xc-vjpf) via `vite`/`vitest`; no patched version is published yet and it never reaches production. Update `vitest` when a fix is released.
- [x] Verified: tsc 0, lint 0, Vitest 1284/1284, CI-style build without secrets, Playwright production 67 passed / 0 failed, Playwright dev with both journeys on a test database 78 passed / 0 failed (new `tests/e2e/public/link-preview.e2e.ts`: tags for WhatsApp and LinkedIn user agents, image fetch and size, and pages rendered with JavaScript disabled).

## 2. Security — fixed in this round

| Severity | Issue | Fix |
|---|---|---|
| High | The public email-verification code endpoint created codes for already verified accounts and `verify-email` signed them in, so guessing codes from many IPs could take over any account (admins included) without its password | Codes are created and accepted only for accounts that still need to verify their email; per-address limits (5 codes, 15 checks per hour) on top of per-IP limits; regression tests run through the real auth handler |
| Medium | Open redirect: `callbackUrl=/.//evil.example` normalised to `//evil.example` | Normalised path is re-checked; payloads added to tests |
| Medium | HR with payroll permission could edit their own payout profile and disburse to themselves | Own payout profile, enrolment and disbursement refused or skipped (and audited) |
| Medium | Users could rename their own account (`/update-user`), which feeds certificates and the offer e-signature | 14 unused Better Auth endpoints disabled (update-user, change-email/password, delete-user, link/unlink social, token readers, update-session) |
| Low–Medium | Header notifications ignored interviewer scope | Same visibility rules as the application queue |
| Low–Medium | ReDoS through admin-defined form patterns | Unsafe patterns rejected at save time and never executed; input capped at 300 characters |
| Low | CSV formula injection in semicolon locales | Every CSV cell is quoted |
| Low | `/api/health` exposed environment and readiness details | Public answer is `{status, timestamp}`; details need the cron secret |
| Low | Interview meeting links accepted `http://` | https only |
| Low | Certificate download echoed internal errors, no id validation | Validated id, operational messages only, `no-store` everywhere |
| Low | PDF generation and visitor tracking without per-user/origin limits | 20 PDFs per minute per user; cross-site visitor POSTs refused |
| Low | Sub-admin permission edit could target non-staff accounts | Target must already hold a staff role |
| Low | Deep page offsets (`?page=999999999`) | Page numbers capped at 10 000 |
| Hardening | Missing isolation headers | `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-site`, wider `Permissions-Policy`; cron secret compared on fixed-length hashes |

## 3. Security — checked and found safe (2026-11-01 audit)

- [x] **SQL injection:** all 25 raw queries are tagged templates with bound parameters; no `$queryRawUnsafe`/`Prisma.raw`; constant `orderBy`.
- [x] **XSS:** only two `dangerouslySetInnerHTML` (static theme script; escaped JSON-LD); user links validated (https only where rendered); every email value HTML-escaped; ICS/PDF inputs escaped; no markdown/HTML rendering of user input.
- [x] **CSRF:** Server Actions keep Next.js' strict Origin check; Better Auth trusted origins are an explicit list; cookies `httpOnly`, `SameSite=Lax`, `Secure` in production.
- [x] **SSRF:** the server never fetches a user-supplied URL.
- [x] **Authorization:** all 64 Server Actions and 9 API routes authenticate, authorize (role + granular permission + record scope), validate with zod and block self-dealing.
- [x] **Files:** magic-byte + MIME allow-list, fail-closed virus scan when uploads are enabled, path-traversal-safe storage, private downloads with `attachment`, `nosniff`, sandbox CSP, `no-store`.
- [x] **Sign-in:** password + emailed code on every password sign-in, no trusted devices, lockout after 10 wrong codes, hashed codes, session revocation on password reset.
- [x] **Secrets:** none in git history; only `NEXT_PUBLIC_WHATSAPP_URL` reaches the browser; no client component imports the database, env or auth server modules.
- [x] **Dependencies:** production `npm audit` clean; the moderate advisories are in the ESLint dev toolchain only (`minimatch`).

## 4. DoS / DDoS

Application level (done):
- [x] Database-backed rate limits on sign-in, sign-up, password reset, code send/verify (per IP and per address), application submission, certificate verification, chatbot, visitor tracking, PDF downloads.
- [x] Every list is paginated in the database (≤ 50 rows), exports capped (10 000 rows), page numbers capped, request bodies limited, public opening pages served from cache.

Platform level (owner actions — an application cannot absorb a volumetric attack on its own):
- [ ] Vercel → Firewall: enable **Bot Protection** and keep **Attack Challenge Mode** ready (switch on during an attack).
- [ ] Vercel → Firewall: add rate-limit rules for `/api/auth/*`, `/careers/*/apply` and `/api/certificates/verify` (e.g. 60 requests/minute per IP).
- [ ] Vercel → Settings → Spend Management: set a spend limit so an attack cannot create an unbounded bill.
- [ ] Neon: confirm the pooled (`-pooler`) connection string in Vercel and autoscaling limits.

## 5. Owner actions before deploying to testing

- [ ] **Commit and push** everything (see `git status`); CI (`.github/workflows/ci.yml`) must pass.
- [ ] **Database for testing:** create a Neon branch for the testing environment (do not share the production database with testers) and apply migrations with `prisma migrate deploy` (RUNBOOK §4).
- [ ] **Vercel environment variables (testing):** `DATABASE_URL` (testing branch, pooled), `BETTER_AUTH_SECRET` (new value for testing), `BETTER_AUTH_URL` = the exact testing URL (the visitor counter and auth origin checks depend on it), `GOOGLE_CLIENT_ID/SECRET` (+ add the testing URL's `/api/auth/callback/google` redirect URI in Google Cloud), `SMTP_*` (sign-in needs working email), `CRON_SECRET`, `PAYOUT_ENCRYPTION_KEY` (32 random bytes, keep a backup). **Do not set `NODE_ENV`.**
- [ ] **Job runner:** point an external scheduler (cron-job.org or a server crontab) at `POST /api/jobs/run` every 5 minutes with `Authorization: Bearer <CRON_SECRET>` (RUNBOOK §5.5).
- [ ] **After deploy:** `curl -H "Authorization: Bearer <CRON_SECRET>" https://<testing-url>/api/health` → `status: ok` and an empty `productionBlockers` list.
- [ ] **OPS-01 (2026-10-17 debug endpoint):** confirm the secrets rotation was completed, and delete or protect old Vercel deployments from 2026-10-17 (Vercel keeps each deployment's own URL reachable). Enable Vercel **Deployment Protection** for previews.
- [ ] **Backups:** delete `.storage/db-backups/` on this machine after the deployment is verified (they contain user and session data).
- [ ] **Canonical domain (2026-11-19):** in Vercel production set `BETTER_AUTH_URL=https://careers.gara-innovations.tech` explicitly (otherwise Vercel may pick the shorter `*.vercel.app` alias), keep `https://careers.gara-innovations.tech/api/auth/callback/google` in Google Cloud, and point the external cron job at the same domain (RUNBOOK §6.3b). Set `SMTP_FROM` to an address on a domain the company controls, with SPF and DKIM.

## 6. Manual test plan for the testing phase

1. **Candidate:** register (job / internship / both) → code email → dashboard; sign out and sign in (password + code); wrong code 5× → friendly error; resend after 60 s; forgot password link.
2. **Apply:** apply to an opening with a Drive resume link; check the confirmation email and the application tracker.
3. **HR:** move the application through screening → shortlist → interview (calendar invite received) → interviewed; try self-scheduling slots; bulk move several applications; see the registrations page and the hiring funnel.
4. **Internship:** select for evaluation (choose a mentor) → mentor reviews checkpoints → HR starts and passes → mark as joined → intern portal (attendance check-in, leave request, ID card).
5. **Full time:** create and extend an offer → candidate downloads the PDF and accepts by typing their name → HR marks joined → employee portal.
6. **HRMS:** leave approve/reject (not your own), attendance correction, payroll period with payout profiles (HR cannot touch their own record), CSV exports.
7. **Roles:** sign in as Manager, Interviewer and Mentor and confirm each sees only their workspace and permitted modules; an interviewer sees only assigned applications.
8. **Phones:** repeat steps 1–2 and the dashboards at 375 px width.

## 7. Decisions and remaining limitations

Resolved by the product owner on 2026-11-01 (details in `docs/OPEN_DECISIONS.md`):
- [x] Managers may view everyone's attendance (current behaviour confirmed).
- [x] The typed-name e-signature is accepted as legally sufficient.
- [x] Payroll finalization includes the finalizer's own record (no deadlock for a one-person payroll team); own payout profile, enrolment and disbursement stay blocked; the audit row records `includesFinalizerOwnRecord`.
- [x] `/careers` static shell fixed: the footer read the clock during the server prerender, which dropped the static shell of every page that also streams request-time content (`/careers`, `/careers/<slug>`, `/verify`). The year is now rendered in the browser; the production-only E2E check passes again.

Remaining, accepted:
- [~] CSP keeps `'unsafe-inline'` (decision 2026-11-01): a nonce-based policy would make every page render per request and remove the static shells and cached public pages; no injection sink exists today.
- [~] Unsafe stored form patterns are skipped (not enforced) so candidates can still apply; staff must fix the pattern.

## 8. Removed as unused (2026-11-01)

`public/favicon.ico` (duplicate of `src/app/favicon.ico`), `docs/RELEASE_READINESS_REPORT.md` (superseded), empty `src/app/api/debug-env/`, unused code (`hasCapability`, `TabsSkeleton`, `ModulePageSkeleton`, `ReportsPageSkeleton`, `registrationFilterParams`, auth-client re-exports, storage index re-exports, `getDownloadUrl` and its signing helpers), obsolete `.gitignore` entries, and the unused brand images `public/brand/gara-emblem-original.jpg`, `gara-logo-transparent.png`, `gara-logo.jpg` (owner decision). Kept on purpose: `prisma7.config.ts`, `worker/jobs-worker.mjs`, `vercel.json`, `public/brand/gara-logo.png` and `gara-emblem.png` (in use).
