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
  },
  fullTime: {
    id: "00000000-0000-4000-8000-00000000e302",
    formVersionId: "00000000-0000-4000-8000-00000000e312",
    slug: "e2e-backend-engineer",
    title: "E2E Backend Engineer",
    type: "FULL_TIME",
    department: "Engineering",
  },
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
