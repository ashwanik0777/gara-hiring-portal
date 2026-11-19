import { describe, it, expect, vi, beforeEach } from "vitest";
import { Role } from "@prisma/client";

// ---------------------------------------------------------------------------
// Round 8 request hardening: https-only interview links, staff-only permission edits,
// bounded page numbers and the certificate download route.
// ---------------------------------------------------------------------------

const { db, mockRequireAuth, mockEnforce, mockCertificatePdf } = vi.hoisted(() => {
  const db = {
    user: { findUnique: vi.fn() },
    userRole: { deleteMany: vi.fn(), create: vi.fn() },
    subAdminPermission: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { db, mockRequireAuth: vi.fn(), mockEnforce: vi.fn(), mockCertificatePdf: vi.fn() };
});

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("better-auth/crypto", () => ({ hashPassword: vi.fn(async () => "hashed") }));
vi.mock("@/infrastructure/email/outbox-processor", () => ({
  NodemailerEmailAdapter: class {
    sendEmail = vi.fn(async () => undefined);
  },
}));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: () => mockRequireAuth() }));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security/rate-limit")>()),
  defaultRateLimiter: { enforce: (...args: unknown[]) => mockEnforce(...args) },
}));
vi.mock("@/features/certificates/services/certificate-service", () => ({
  certificateService: { getCertificatePdfBuffer: (...args: unknown[]) => mockCertificatePdf(...args) },
}));

import { NextRequest } from "next/server";
import { ScheduleInterviewSchema } from "@/features/recruitment/schemas";
import { updateSubAdminPermissionsAction } from "@/features/subadmins/actions";
import { clampPageNumber, MAX_PAGE_NUMBER } from "@/lib/pagination";
import { parsePageParam } from "@/features/recruitment/components/list-pagination";
import { parsePositivePage } from "@/features/employees/components/list-search-params";
import { GET as downloadCertificate } from "@/app/api/certificates/[id]/download/route";
import { ForbiddenError, NotFoundError, RateLimitError, UnauthorizedError } from "@/lib/errors";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const CERT_ID = "33333333-3333-4333-8333-333333333333";

const admin = { id: ADMIN_ID, email: "admin@gara.test", name: "Admin", roles: [Role.ADMIN] };

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async (cb: (tx: typeof db) => Promise<unknown>) => cb(db));
  db.userRole.deleteMany.mockResolvedValue({ count: 1 });
  mockRequireAuth.mockResolvedValue(admin);
});

// ---------------------------------------------------------------------------

describe("Interview meeting links are https only", () => {
  const base = {
    applicationId: "44444444-4444-4444-8444-444444444444",
    roundName: "Technical round",
    scheduledAt: "2026-11-10T10:00:00.000Z",
  };
  const parse = (meetingLink: unknown) => ScheduleInterviewSchema.safeParse({ ...base, meetingLink });

  it.each(["http://meet.example.com/abc", "javascript:alert(1)", "ftp://meet.example.com/x", "not a url"])(
    "rejects %s",
    (link) => {
      expect(parse(link).success).toBe(false);
    }
  );

  it("accepts https links (trimmed), an empty value and no link", () => {
    const parsed = parse("  https://meet.google.com/abc-defg-hij  ");
    expect(parsed.success && parsed.data.meetingLink).toBe("https://meet.google.com/abc-defg-hij");
    expect(parse("").success).toBe(true);
    expect(parse(null).success).toBe(true);
    expect(parse(undefined).success).toBe(true);
  });

  it("explains the rule", () => {
    const parsed = parse("http://meet.example.com/abc");
    expect(parsed.error?.issues[0]?.message).toBe("Meeting link must start with https://");
  });
});

// ---------------------------------------------------------------------------

describe("updateSubAdminPermissionsAction only edits existing staff", () => {
  type StaffRole = Parameters<typeof updateSubAdminPermissionsAction>[0]["role"];
  const input = (role: StaffRole = Role.HR) => ({
    subAdminId: TARGET_ID,
    role,
    permissions: {
      canApplications: true,
      canOpenings: false,
      canInterviews: false,
      canEvaluations: false,
      canEmployees: false,
      canAttendance: false,
      canLeave: false,
      canPayroll: true,
      canReports: false,
    },
  });

  it.each([[[Role.CANDIDATE]], [[Role.INTERN]], [[Role.EMPLOYEE]], [[Role.EMPLOYEE, Role.CANDIDATE]], [[]]])(
    "never turns a user with roles %j into staff",
    async (roles) => {
      db.user.findUnique.mockResolvedValue({ id: TARGET_ID, roles: roles.map((role) => ({ role })) });

      const res = await updateSubAdminPermissionsAction(input());

      expect(res).toMatchObject({ success: false, error: expect.stringContaining("does not hold a staff role") });
      expect(db.$transaction).not.toHaveBeenCalled();
      expect(db.userRole.create).not.toHaveBeenCalled();
      expect(db.subAdminPermission.upsert).not.toHaveBeenCalled();
    }
  );

  it("refuses Super Admins and the actor's own account", async () => {
    db.user.findUnique.mockResolvedValue({ id: TARGET_ID, roles: [{ role: Role.ADMIN }, { role: Role.HR }] });
    await expect(updateSubAdminPermissionsAction(input())).resolves.toMatchObject({ success: false });

    await expect(updateSubAdminPermissionsAction({ ...input(), subAdminId: ADMIN_ID })).resolves.toMatchObject({
      success: false,
      error: "You cannot change your own roles or permissions.",
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuses non-admins", async () => {
    mockRequireAuth.mockResolvedValue({ ...admin, id: TARGET_ID, roles: [Role.HR] });
    await expect(updateSubAdminPermissionsAction(input())).resolves.toMatchObject({ success: false });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("updates a staff member's role and permissions, keeping non-staff roles", async () => {
    db.user.findUnique.mockResolvedValue({ id: TARGET_ID, roles: [{ role: Role.MENTOR }, { role: Role.EMPLOYEE }] });

    const res = await updateSubAdminPermissionsAction(input(Role.INTERVIEWER));

    expect(res).toMatchObject({ success: true });
    expect(db.userRole.deleteMany).toHaveBeenCalledWith({
      where: { userId: TARGET_ID, role: { in: [Role.HR, Role.MANAGER, Role.INTERVIEWER, Role.MENTOR] } },
    });
    expect(db.userRole.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: TARGET_ID, role: Role.INTERVIEWER, assignedBy: ADMIN_ID }),
    });
  });

  it("rolls back when the staff role was revoked between the check and the update", async () => {
    db.user.findUnique.mockResolvedValue({ id: TARGET_ID, roles: [{ role: Role.HR }] });
    db.userRole.deleteMany.mockResolvedValue({ count: 0 });

    const res = await updateSubAdminPermissionsAction(input());

    expect(res).toMatchObject({ success: false, error: expect.stringContaining("does not hold a staff role") });
    expect(db.userRole.create).not.toHaveBeenCalled();
    expect(db.subAdminPermission.upsert).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe("Page numbers from the URL are bounded", () => {
  it("clamps to 1..MAX_PAGE_NUMBER and treats junk as page 1", () => {
    expect(MAX_PAGE_NUMBER).toBe(10_000);
    expect(clampPageNumber(undefined)).toBe(1);
    expect(clampPageNumber(null)).toBe(1);
    expect(clampPageNumber(Number.NaN)).toBe(1);
    expect(clampPageNumber(Number.POSITIVE_INFINITY)).toBe(1);
    expect(clampPageNumber(-4)).toBe(1);
    expect(clampPageNumber(0)).toBe(1);
    expect(clampPageNumber(3.9)).toBe(3);
    expect(clampPageNumber(10_000)).toBe(10_000);
    expect(clampPageNumber(10_001)).toBe(10_000);
    expect(clampPageNumber(Number.MAX_SAFE_INTEGER)).toBe(10_000);
  });

  it("applies the ceiling in the search-param parsers", () => {
    expect(parsePageParam("999999999999")).toBe(MAX_PAGE_NUMBER);
    expect(parsePageParam("12")).toBe(12);
    expect(parsePageParam("abc")).toBe(1);
    expect(parsePositivePage("999999999999")).toBe(MAX_PAGE_NUMBER);
    expect(parsePositivePage(["5", "9"])).toBe(5);
    expect(parsePositivePage(undefined)).toBe(1);
  });
});

// ---------------------------------------------------------------------------

describe("GET /api/certificates/[id]/download", () => {
  const download = (id = CERT_ID) =>
    downloadCertificate(new NextRequest(`http://localhost/api/certificates/${id}/download`), {
      params: Promise.resolve({ id }),
    });

  it("serves the PDF as a no-store attachment after the per-user rate limit", async () => {
    mockCertificatePdf.mockResolvedValue(Buffer.from("%PDF-1.4 test"));

    const res = await download();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(`attachment; filename="GARA_Certificate_${CERT_ID}.pdf"`);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(res.headers.get("Content-Security-Policy")).toBe("default-src 'none'; sandbox");
    expect(mockEnforce).toHaveBeenCalledWith(
      ADMIN_ID,
      expect.objectContaining({ scope: "pdf:certificate_download", maxRequests: 20, windowSeconds: 60 })
    );
    expect(mockCertificatePdf).toHaveBeenCalledWith(CERT_ID, ADMIN_ID, [Role.ADMIN]);
  });

  it.each(["not-a-uuid", "../../etc/passwd", `${CERT_ID}x`])("returns 404 for the malformed id %s", async (id) => {
    const res = await download(id);
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(mockEnforce).not.toHaveBeenCalled();
    expect(mockCertificatePdf).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After once the user exceeds the limit", async () => {
    mockEnforce.mockRejectedValue(new RateLimitError(42));

    const res = await download();

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(await res.json()).toEqual({
      error: "Too many downloads. Please wait a minute and try again.",
      code: "RATE_LIMIT_EXCEEDED",
    });
    expect(mockCertificatePdf).not.toHaveBeenCalled();
  });

  it("passes operational errors through and keeps every error no-store", async () => {
    mockRequireAuth.mockRejectedValueOnce(new UnauthorizedError());
    const unauthenticated = await download();
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get("Cache-Control")).toContain("no-store");

    mockCertificatePdf.mockRejectedValueOnce(new ForbiddenError("Not your certificate"));
    const forbidden = await download();
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: "Not your certificate", code: "FORBIDDEN" });

    mockCertificatePdf.mockRejectedValueOnce(new NotFoundError("Certificate not found"));
    expect((await download()).status).toBe(404);
  });

  it("hides non-operational failures behind a generic message", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const internal = new NotFoundError("relation \"certificates\" does not exist at 10.0.0.5");
    Object.defineProperty(internal, "isOperational", { value: false });
    mockCertificatePdf.mockRejectedValueOnce(internal);

    const res = await download();

    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    const body = JSON.stringify(await res.json());
    expect(body).toContain("We couldn't prepare the certificate right now");
    expect(body).not.toContain("10.0.0.5");

    mockCertificatePdf.mockRejectedValueOnce(new Error("connection refused at 10.0.0.5"));
    const crashed = await download();
    expect(crashed.status).toBe(500);
    expect(JSON.stringify(await crashed.json())).not.toContain("10.0.0.5");
    consoleError.mockRestore();
  });
});
