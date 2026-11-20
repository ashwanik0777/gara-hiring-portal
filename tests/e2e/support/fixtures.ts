/**
 * Deterministic E2E fixtures. They are written ONLY to the dedicated test database named by
 * E2E_DATABASE_URL (see global-setup.ts) and are clearly marked as test data:
 * "E2E" names, reserved `.test` email domain, fixed UUIDs.
 */

/**
 * Test-only fixed one-time code. Playwright hands it to the app server as E2E_FIXED_OTP for
 * runs on the dedicated test database, because emailed codes are stored hashed and cannot be
 * read back. The server honours it only outside production and only when connected to that
 * database (see resolveFixedTestOtp in src/lib/auth/auth.ts).
 */
export const E2E_FIXED_OTP = "246810";

/** Test-only password for the seeded staff accounts (never valid outside the test database). */
export const E2E_STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD ?? "E2e-Fixture-Staff-2026!";

export const E2E_USERS = {
  admin: {
    id: "00000000-0000-4000-8000-00000000e201",
    name: "E2E Admin",
    email: "e2e-admin@example.test",
    roles: ["ADMIN"],
  },
  hr: {
    id: "00000000-0000-4000-8000-00000000e202",
    name: "E2E Recruiter",
    email: "e2e-hr@example.test",
    roles: ["HR"],
  },
  mentor: {
    id: "00000000-0000-4000-8000-00000000e203",
    name: "E2E Mentor",
    email: "e2e-mentor@example.test",
    roles: ["MENTOR"],
  },
  // Industrial Training student with a paid enrollment in E2E_TRAINING's batch (Phase 3B).
  trainee: {
    id: "00000000-0000-4000-8000-00000000e204",
    name: "E2E Trainee",
    email: "e2e-trainee@example.test",
    roles: ["CANDIDATE"],
  },
} as const;

/** Granular permissions of the seeded HR user (the recruitment and joining workflows). */
export const E2E_HR_PERMISSIONS = {
  canApplications: true,
  canOpenings: true,
  canInterviews: true,
  canEvaluations: true,
  canEmployees: true,
  canAttendance: false,
  canLeave: false,
  canPayroll: false,
  canReports: true,
} as const;

export const E2E_OPENINGS = {
  internship: {
    id: "00000000-0000-4000-8000-00000000e301",
    formVersionId: "00000000-0000-4000-8000-00000000e311",
    slug: "e2e-software-engineering-intern",
    title: "E2E Software Engineering Intern",
    type: "INTERNSHIP",
    department: "Engineering",
    // Listing details (track seeded by the Phase 2 migration; deadline relative to the run).
    trackSlug: "software",
    deadlineDaysFromNow: 30,
    durationText: "3 months",
    skills: ["TypeScript", "React"],
  },
  fullTime: {
    id: "00000000-0000-4000-8000-00000000e302",
    formVersionId: "00000000-0000-4000-8000-00000000e312",
    slug: "e2e-backend-engineer",
    title: "E2E Backend Engineer",
    type: "FULL_TIME",
    department: "Engineering",
    trackSlug: null,
    deadlineDaysFromNow: null,
    durationText: null,
    skills: [],
  },
} as const;

/**
 * A published opening whose last date to apply has passed: it must not be listed, must show a
 * closed notice and must refuse applications. Kept out of E2E_OPENINGS (which are all open).
 */
export const E2E_EXPIRED_OPENING = {
  id: "00000000-0000-4000-8000-00000000e303",
  formVersionId: "00000000-0000-4000-8000-00000000e313",
  slug: "e2e-expired-design-intern",
  title: "E2E Expired Design Intern",
  type: "INTERNSHIP",
  department: "Design",
  trackSlug: "software",
  deadlineDaysFromNow: -2,
  durationText: null,
  skills: [],
} as const;

/**
 * A published Industrial Training programme with one open batch (dates relative to the run).
 * Payments stay switched off in the test environment (no Razorpay keys), so no order is created.
 */
export const E2E_TRAINING = {
  programId: "00000000-0000-4000-8000-00000000e401",
  batchId: "00000000-0000-4000-8000-00000000e411",
  slug: "e2e-full-stack-training",
  title: "E2E Full-Stack Web Development",
  summary: "End-to-end test fixture: build and deploy a web app with mentors.",
  feePaise: 499_900,
  feeLabel: "₹4,999",
  durationWeeks: 8,
  trackSlug: "software",
  batchName: "E2E January Batch",
  batchStartsInDays: 20,
  seats: 25,
  /** The trainee's paid enrollment takes one seat. */
  seatsTaken: 1,
  enrollmentId: "00000000-0000-4000-8000-00000000e421",
  sessionId: "00000000-0000-4000-8000-00000000e431",
  sessionTitle: "E2E Orientation Class",
  assignmentId: "00000000-0000-4000-8000-00000000e441",
  assignmentTitle: "E2E Landing Page Assignment",
  assignmentMaxMarks: 20,
  syllabus: [
    { week: 1, title: "Foundations", topics: ["HTML and CSS", "Git"] },
    { week: 2, title: "React", topics: ["Components", "State"] },
  ],
} as const;

/** A unique, valid identity for a candidate created during one test. */
export function newCandidateIdentity(label: string) {
  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return {
    name: `E2E Candidate ${label} ${runId}`.replace(/[^A-Za-z0-9 ]/g, ""),
    email: `e2e-${label.toLowerCase()}-${runId}@example.test`,
    password: "E2e-Candidate-Pass-2026!",
    employeeCode: `E2E-${label.toUpperCase()}-${runId.toUpperCase()}`.replace(/[^A-Z0-9-]/g, ""),
  };
}
