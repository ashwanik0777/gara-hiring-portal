# Careers Portal Update Plan

**Portal:** https://careers.gara-innovations.tech
**Source:** "GARA INNOVATION — Careers Portal Update Plan" from the product owner (19 Nov 2026), checked against the code in this repository.
**Working model:** one phase at a time. After each phase: summary, files changed, migrations, new environment variables, manual test steps and open decisions. The next phase starts only after the product owner says go.

---

## 1. Decisions taken on 2026-11-19

| Topic | Decision |
|---|---|
| Phase order | 0 → 1 → 2 → 5 → 3 → 4 → 6 (certificates before Industrial Training, because training completion needs the generalised certificate). Within Phase 3: 3A, 3B, then Phase 4, then 3C. |
| Resume on the apply form | Keep the current Google Drive link (`DOCUMENT_STORAGE_MODE=link`). PDF upload waits for a storage provider (OD-013). |
| Printed certificate orders | Built last in Industrial Training (3C), before the first batch completes. Exact prices and the courier partner are decided by then. |
| One application per opening | Strict: one application per user per opening, ever. No re-apply after withdrawal or rejection. Enforced with a database unique constraint (production had no duplicate pairs on 2026-11-19). |
| Campus Ambassador payouts | Automatic payouts through RazorpayX. The company opens and verifies the RazorpayX account. |
| Fraud alert banner and "No fee" tag | Both removed on the product owner's request. The Terms and the Refund Policy still state that internships are free. |
| Page width | Every page is full width: no centred max-width box. Side padding grows with the screen (`PAGE_GUTTER` in `src/components/layout/page-gutter.ts`, shared by navbar, content and footer). Long text uses side columns on large screens instead of very long lines. Not `min-w-7xl`, which would force sideways scrolling on phones. |
| Footer | Policy links in their own "Policies" column after "Candidate Lifecycle"; the bottom bar keeps copyright (left), "Architected & Engineered with ♥ by GARA INNOVATION" (centre, the original design restored on the product owner's request instead of "Built by"), Privacy Policy and Terms of Service (right). |
| Side padding and navigation | Side padding grows from 16px (phones) to 56px (tablets, clearing the floating social dock) and 64–128px on large screens; the dock is slimmer (36px buttons). Header links show from 1024px wide (narrower headers show the logo and account buttons only, as on phones) and never wrap. |

Business rules from the source plan (internships always free; training paid with the digital certificate included; no GST documents, "Payment Receipt" only; refund window; money in paise; no team page) apply to every phase.

## 2. Already built (extended, not rebuilt)

- Openings with type, department, location, mode (`workplaceType`), description, requirements, responsibilities, status (DRAFT, PUBLISHED, PAUSED, CLOSED); admin create, edit and close.
- Server-rendered `/careers` and `/careers/[slug]` with Open Graph images, JobPosting JSON-LD (remote openings marked `TELECOMMUTE`; `validThrough` wired, waiting for a deadline field), sitemap and robots (dashboard routes disallowed).
- Apply flow into the recruitment pipeline with status history, per-opening form builder, source and UTM tracking.
- Email OTP on sign-up and on every password sign-in (covers "email verification before payment").
- Certificates with QR, `/verify`, `/verify/[code]`, revocation and verification log.
- Full-time offer letter PDF with electronic acceptance.
- Email outbox, scheduled jobs, audit log, rate limiter, field encryption, CSV exports, admin reports.
- MENTOR role (used for training mentors).

## 3. Deliberate differences from the source plan

| Source plan | Implementation | Reason |
|---|---|---|
| Opening type `JOB`, status `OPEN` | Keep `FULL_TIME` and `PUBLISHED`; the UI says "Job" and "Open" | Renaming enums means a migration across the whole pipeline for no user benefit |
| Role `STUDENT` | Keep `CANDIDATE` as the student role; add only `CAMPUS_AMBASSADOR` | Same |
| `NEXT_PUBLIC_SITE_URL` | The site URL stays `BETTER_AUTH_URL` (`src/lib/site-url.ts`) | Two variables for one value drift apart and break links |
| `/careers?track=full-stack` | Query filters on `/careers`, plus indexable track pages such as `/careers/tracks/full-stack` | Path pages rank for "full-stack internship"; query variants are canonicalised to `/careers` |
| Training and CA navigation in Phase 0 | Added when each page goes live (Phase 3A and Phase 4) | A link to a missing page is a 404 for users and crawlers |
| All emails in Phase 6 | Each phase ships its own emails, admin screens and CSV exports | The payment receipt email is needed in Phase 3A |
| Name and email on the apply form | Prefilled from the verified account | Retyping invites mistakes |
| `"TODO_CIN"` placeholders | Unknown values are `null` in `src/config/site.ts` and their line is hidden | A placeholder must never appear on the public site |
| "Open Roles" cards linked in Phase 0 | Linked to track pages in Phase 2 | Tracks and filters do not exist before Phase 2 |

## 4. Not built (skipped)

1. Team page (the source plan excludes it).
2. Generic coupon codes: no coupon rules were given; only the Campus Ambassador referral discount is built.
3. WhatsApp notifications: the notification service stays channel-agnostic so WhatsApp can be added later.
4. Deleting visitor data: the public visitor count is removed, but admin reports still use the `site_visitors` table.
5. Converting `responsibilities` to an array: multi-line text already renders line by line.
6. FAQPage JSON-LD: Google shows FAQ rich results only for government and health sites since 2023.

## 5. Added (not in the source plan, needed)

- Canonical domain: permanent redirect of every `*.vercel.app` page to the canonical domain in production builds (API routes excluded), and removal of the stale `gara-hiring-portal.vercel.app` trusted origin (that host no longer belongs to this project; if someone else claimed it, it would have been trusted by sign-in).
- `/contact` page and a short shipping and delivery policy: Razorpay checks Contact, Privacy, Terms, Refund and Shipping pages during live activation; printed certificates are shipped.
- Content-Security-Policy entries for Razorpay Checkout (Phase 3A).
- Consent records: which policy version each user accepted, and when (Digital Personal Data Protection Act, 2023).
- A TDS field on the commission ledger; the rule itself comes from the company's accountant.
- `SMTP_FROM` on the company's own domain (the code default `no-reply@garainnovation.com` is not the company domain; mail from it lands in spam).

## 6. Phases

### Phase 0 — Public site cleanup: **done (2026-11-19)**

- `src/config/site.ts`: company details (registered name, CIN, Udyam number, registered address: `null` until provided), contact email, announcement, social profiles.
- Home page: announcement from config ("Winter 2026 cohort — applications open"), student badges (Real Projects, Mentor Support, Verified QR Certificates, 7-Day Evaluation), RBAC, HRMS, payroll and "Platform Architecture" content removed, a student-facing "Why GARA" section, a descriptive hero paragraph.
- Footer: "Recorded visitors:" removed (visits are still recorded silently for the admin report), "Built by GARA INNOVATION", company details shown only when configured, sitemap link to `/sitemap.xml`.
- Careers: "No fee" tag on internship cards and pages (removed later the same day on the product owner's request).
- The fraud alert banner shipped first was removed the same day on the product owner's request.
- Email links and the sub-admin welcome link use the configured site URL (no hard-coded host).
- Verification: TypeScript and ESLint clean (one pre-existing warning in `evaluation-portal-views.tsx`, an import kept for a heading commented out by the owner); Vitest 42 files, 1,293 tests passed; production build passed; Playwright production mode 71 passed, development mode with the journey database 82 passed, 0 failed; redirect checked on a production build (pages 308 with path and query kept, `/api/*` untouched).

### Phase 1 — Policy pages and SEO base: **done (2026-11-19)**

- Static pages `/privacy`, `/terms`, `/refund-policy`, `/shipping-policy`, `/cookie-policy` and `/contact`, in simple English, built with the shared layout in `src/components/legal/legal-page.tsx`. Each has its own title, description, canonical URL and BreadcrumbList JSON-LD.
- "Draft — pending legal review" notice: shown while `LEGAL.reviewed` is false in `src/config/site.ts`, except on production deployments (`VERCEL_ENV=production`), as the source plan asks. `LEGAL.version` identifies the wording; Phase 2 stores it with each consent.
- Content describes what the system really does: the data each module stores, the processors (Vercel, Neon, the email provider, Google sign-in, Razorpay), servers in Singapore, hashing and encryption, DPDP Act 2023 rights and the Data Protection Board. The cookie table lists the real cookies (`better-auth.session_token`, `better-auth.dont_remember`, `better-auth.two_factor`, `better-auth.state`, `gara_vid`) and browser storage keys; a unit test checks the names against the code. Source attribution uses URL parameters, not a cookie.
- Refund policy text comes from `TRAINING_POLICY` in `src/config/site.ts` (24-hour window, one free transfer, one free re-attempt, gateway charges not deducted); Phase 3 enforces the same values on the server.
- Footer: a "Policies" row linking every page and the sitemap (replacing the old links to `/help`). Sitemap lists the six pages. Home page carries Organization and WebSite JSON-LD; opening pages add a BreadcrumbList. All JSON-LD goes through the escaped `JsonLd` component (`src/components/seo/json-ld.tsx`).
- Not written into the drafts because no rule exists yet (see OPEN_DECISIONS items 33–36): minimum age, what happens when GARA cancels a batch, failed or duplicate payments, refunds of printed certificates.
- Verification: TypeScript clean, ESLint clean apart from the pre-existing warning; Vitest 43 files, 1,308 tests passed; production build passed with all six pages static; Playwright production mode 91 passed, development mode with the journey database 102 passed, 0 failed.

### Phase 2 — Listings and apply flow: **done (2026-11-19)**

What was built (details below are the original plan):
- **Openings:** track, summary, skills, eligibility, duration, stipend policy, number of positions and last date to apply, edited in a new "Opening details" form on the staff editor (openings could not be edited after creation before). The last date counts as the whole day in the business time zone; afterwards the opening leaves the listings and sitemap, its page says "Applications closed" without an apply button or JobPosting data, and the server refuses applications.
- **Tracks:** staff add, rename, reorder or hide tracks under Job Openings ("Career tracks"); the five plan tracks are seeded. `/careers` has track, type and mode filters as plain links; each track has an indexable page `/careers/tracks/{slug}` (own title, canonical URL, breadcrumb, Open Graph image; noindex while it has no open opening); `/careers/tracks` redirects to `/careers`. Footer "Open Roles" links go to the track pages.
- **Apply form:** a "Your education" block on every apply form (college picker over the college master with "type a name that is not listed", branch, year of study, graduation year) prefilled from the profile, and a mandatory Privacy Policy and Terms checkbox. College and graduation year are required for internships. The consent time and policy version are stored on the application; education details on the profile. Staff see both on the application page.
- **One application per opening:** checked before and inside the submission transaction and enforced by a unique index; the apply page shows "You Have Already Applied" with a link to the application (right after a submission the success card stays).
- **College master:** colleges typed by students are pending and visible only to them until an administrator approves or corrects them at `/admin/colleges`. Merging duplicates is Phase 6.
- **Not in this phase:** the referral code field (Phase 4, together with the change of the `ref` parameter), resume upload (Drive link kept, decision 2026-11-19).
- **Database:** migration `20261119000000_careers_listings_and_apply`, applied to production on 2026-11-19 after a read-only drift check and a JSON backup (`.storage/db-backups/2026-11-19T17-55-16-320Z`); verified afterwards (5 tracks, unique index, checks, unchanged row counts).
- **Verification:** TypeScript clean; ESLint clean apart from the pre-existing warning; Vitest 45 files, 1,351 tests passed; production build passed; Playwright production mode 99 passed; production mode with the test database (public suites) 124 passed; development mode with the journey database (all suites) 124 passed, 0 failed.

Plan as written:

- Opening fields: track, summary, skills, eligibility (years, branches), durationText, stipendPolicyText, openingsCount, applyDeadline.
- Admin-managed track list, seeded with software, full-stack, ui-ux, ai-ml, cloud-backend.
- Past the deadline an opening shows as closed, the server rejects applications, and its JobPosting markup is removed; `validThrough` comes from the deadline.
- `/careers` filters (type, track, mode); cards show duration, mode, stipend policy and deadline.
- College master (searchable, "Other" creates an entry for admin approval), branch, year and graduation year stored on the candidate profile.
- "Why do you want this role?" and a mandatory consent checkbox; one application per opening (database constraint).
- The `ref` query parameter is freed for referral codes: the referrer host moves to its own parameter.

### Phase 5 — Certificates and offer letters (before Phase 3)

- Certificate types INTERNSHIP_COMPLETION, TRAINING_COMPLETION, CAMPUS_AMBASSADOR; new IDs `GARA-{TYPE}-{YEAR}-{6}` from an alphabet without look-alike characters; existing `GARA-CERT-…` codes keep verifying.
- PDF with company name, CIN, Udyam number, recipient, college, programme, dates, project, grade, two signatures and QR. Fields the system does not hold are left out, never filled with made-up values.
- `/verify/[id]` shows status, name, programme and dates only.
- Internship offer letter PDF, reusing the full-time offer letter engine.

### Phase 3 — Industrial Training

- **3A Catalogue and payment:** TrainingProgram, Batch, Enrollment, Refund; `/training` and `/training/[slug]` (Course JSON-LD, Open Graph image); checkout with server-side pricing, Razorpay order, signature verification and an idempotent webhook; a 15-minute seat hold; Payment Receipt PDF with sequential receipt numbers and no GST line, emailed; refund button only inside the window (also enforced on the server), admin approval, Razorpay refund API; one free transfer after the window; optional gateway-charge deduction (default off).
- **3B Learning area:** sessions (meeting link visible to enrolled students only), attendance, assignments and grading, final project, demo slot booking, progress against the pass criteria (60% marks, 75% attendance, project and demo passed, all configurable), mentor approval, certificate, one free re-attempt after a fail.
- **3C Printed certificates:** after Phase 4, before the first batch ends.

### Phase 4 — Campus Ambassador

- `/campus-ambassador` page and application; admin approval as LEAD or ASSOCIATE (one Lead per college), 30-day trial flag.
- Referral code, link and QR; 30-day last-click attribution cookie; code gives the student discount at checkout (default 10%).
- Dashboard: clicks, sign-ups, applications, paid enrollments, earnings (pending, payable, paid), leaderboard, marketing kit, UPI ID (encrypted).
- Commission ledger: entry when an enrollment becomes active, payable after `firstClassAt + 24h`, reversed automatically on refund; payouts through RazorpayX.
- Anti-abuse: self-referral blocked, duplicate phone or email flagged, click tracking rate-limited.

### Phase 6 — Remaining work

- Reminder 24 hours before the first class and any notifications not shipped earlier.
- College duplicate merge, Training and Campus Ambassador questions in Help & FAQ.
- Mobile Lighthouse score of 90 or more on public pages.

## 7. Search engine optimisation (every phase)

- Public pages render on the server (no "Loading…" screen) with their own title, description, Open Graph image and canonical URL.
- One canonical domain; `*.vercel.app` pages redirect permanently.
- Sitemap lists only live pages: openings, track pages that have openings, training programmes, policy pages, the Campus Ambassador page. Dashboard, admin and API routes stay disallowed.
- Structured data: JobPosting (deadline, intern or full-time, remote), Course, Organization, BreadcrumbList.
- Closed openings and batches keep their page with a "closed" state and drop the JobPosting markup.

## 8. Values needed from the product owner

| When | Value |
|---|---|
| Now | Exact registered company name, CIN, Udyam number, registered office address |
| Before Phase 1 goes live | Legal review of the policy drafts |
| Phase 5 | Names and designations of the two signatories, and their signature images (transparent PNG) or typed names only |
| Phase 3A | Razorpay test keys and webhook secret; programmes, fees and batch dates are entered in the admin panel |
| Phase 3C | Print prices and courier partner |
| Phase 4 | RazorpayX account; posters, WhatsApp message template, pitch script; commission and discount values if not the defaults (₹100, 10%) |
| Phase 4 | TDS treatment of ambassador commissions (company accountant) |
