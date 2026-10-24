import { describe, it, expect, vi, beforeEach } from "vitest";
import { Role } from "@prisma/client";

const { mockPrisma, mockSession } = vi.hoisted(() => {
  process.env.CRON_SECRET = "test-cron-secret-0123456789";
  const prisma: Record<string, unknown> = {
    user: { findUnique: vi.fn(), delete: vi.fn() },
    userRole: { findMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
    subAdminPermission: { findUnique: vi.fn(), deleteMany: vi.fn(), upsert: vi.fn() },
    session: { deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
    notificationOutbox: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
  };
  return { mockPrisma: prisma, mockSession: { current: null as null | { user: { id: string; email: string; name: string } } } };
});

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { getSession: vi.fn(async () => mockSession.current) } },
}));
vi.mock("better-auth/crypto", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed"),
}));

import { sanitizeCallbackPath } from "@/lib/auth/redirects";
import {
  escapeHtml,
  safeHttpUrl,
  buildInterviewInvitationEmail,
  buildApplicationStageUpdateEmail,
  buildPasswordResetEmail,
} from "@/infrastructure/email/email-templates";
import { toActionError, ForbiddenError, ValidationError } from "@/lib/errors";
import { assertPermission, requireAuth, type AuthenticatedUser } from "@/lib/auth/guards";
import {
  deleteSubAdminAction,
  updateSubAdminPermissionsAction,
} from "@/features/subadmins/actions";
import { GET as outboxCron } from "@/app/api/cron/outbox/route";
import { NextRequest } from "next/server";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";

function signInAs(userId: string, roles: Role[], mustChangePassword = false) {
  mockSession.current = { user: { id: userId, email: `${userId}@gara.test`, name: "Tester" } };
  vi.mocked(mockPrisma.user as { findUnique: ReturnType<typeof vi.fn> }).findUnique.mockImplementation(
    async (args: { where: { id: string } }) =>
      args.where.id === userId
        ? { mustChangePassword, roles: roles.map((role) => ({ role })) }
        : null
  );
}

const fullPermissions = {
  canApplications: true,
  canOpenings: true,
  canInterviews: true,
  canEvaluations: true,
  canEmployees: true,
  canAttendance: true,
  canLeave: true,
  canPayroll: true,
  canReports: true,
};

describe("sanitizeCallbackPath (open-redirect protection)", () => {
  it("keeps same-origin relative paths with query strings", () => {
    expect(sanitizeCallbackPath("/admin/applications?tab=new")).toBe("/admin/applications?tab=new");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\\/evil.example",
    "javascript:alert(1)",
    "/admin\u0000",
    "",
    null,
  ])("rejects %s", (value) => {
    expect(sanitizeCallbackPath(value)).toBe("/dashboard");
  });
});

describe("Email template HTML injection protection", () => {
  it("escapes HTML special characters", () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;"
    );
  });

  it("accepts only http(s) links", () => {
    expect(safeHttpUrl("https://meet.example.com/abc")).toBe("https://meet.example.com/abc");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,<script>")).toBeNull();
  });

  it("drops non-http meeting links and escapes staff-entered text", () => {
    const email = buildInterviewInvitationEmail({
      candidateName: "<b>Eve</b>",
      openingTitle: "Engineer <script>alert(1)</script>",
      roundName: "Round 1",
      scheduledAt: new Date("2026-11-02T10:00:00Z").toISOString(),
      durationMinutes: 45,
      meetingLink: "javascript:alert(document.cookie)",
    });
    expect(email.html).not.toContain("javascript:");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).not.toContain("<b>Eve</b>");
  });

  it("escapes hiring-team messages", () => {
    const email = buildApplicationStageUpdateEmail({
      candidateName: "Ann",
      openingTitle: "Analyst",
      referenceCode: "GARA-2026-APP-ABC123",
      newStatus: "SCREENING",
      message: `<a href="https://phish.example">Verify your bank</a>`,
    });
    expect(email.html).not.toContain(`<a href="https://phish.example">`);
  });

  it("builds a reset-link email without any temporary password", () => {
    const email = buildPasswordResetEmail({
      name: "Ann",
      resetUrl: "https://gara-hiring-portal.vercel.app/api/auth/reset-password/tok?callbackURL=%2Freset-password",
      expiresInMinutes: 60,
    });
    expect(email.html).toContain("Choose a New Password");
    expect(email.text).toContain("valid for 60 minutes");
    expect(email.html.toLowerCase()).not.toContain("temporary password");
  });
});

describe("toActionError (no internal error leakage)", () => {
  it("returns operational AppError messages", () => {
    expect(toActionError(new ValidationError("Opening title is required"))).toBe(
      "Opening title is required"
    );
  });

  it("maps Prisma unique violations to a safe message", () => {
    expect(toActionError({ code: "P2002", meta: { target: ["users_email_key"] } })).toBe(
      "A record with these details already exists."
    );
  });

  it("hides unexpected errors behind the fallback", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const message = toActionError(
      new Error("Invalid `prisma.user.update()` invocation in /var/task/src/x.ts:12"),
      "Could not save."
    );
    expect(message).toBe("Could not save.");
    spy.mockRestore();
  });
});

describe("Guards: forced password change and granular permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects temporary-password sessions unless explicitly allowed", async () => {
    signInAs(TARGET_ID, [Role.HR], true);
    await expect(requireAuth()).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requireAuth({ allowPendingPasswordChange: true })).resolves.toMatchObject({
      id: TARGET_ID,
    });
  });

  it("denies HR when the module permission was revoked", async () => {
    const hr: AuthenticatedUser = { id: TARGET_ID, email: "hr@gara.test", name: "HR", roles: [Role.HR] };
    vi.mocked(mockPrisma.subAdminPermission as { findUnique: ReturnType<typeof vi.fn> }).findUnique.mockResolvedValueOnce({
      ...fullPermissions,
      canPayroll: false,
    });
    await expect(assertPermission(hr, "canPayroll")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("denies candidates every staff module", async () => {
    const candidate: AuthenticatedUser = { id: TARGET_ID, email: "c@gara.test", name: "C", roles: [Role.CANDIDATE] };
    await expect(assertPermission(candidate, "canApplications")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows ADMIN without a permission row", async () => {
    const admin: AuthenticatedUser = { id: ADMIN_ID, email: "a@gara.test", name: "A", roles: [Role.ADMIN] };
    await expect(assertPermission(admin, "canPayroll")).resolves.toMatchObject({ canPayroll: true });
  });

  it("enforces the role allow-list in addition to the flag", async () => {
    const mentor: AuthenticatedUser = { id: TARGET_ID, email: "m@gara.test", name: "M", roles: [Role.MENTOR] };
    await expect(
      assertPermission(mentor, "canEvaluations", { roles: [Role.HR] })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("Sub-admin management preserves history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revokes staff access without deleting the user record", async () => {
    signInAs(ADMIN_ID, [Role.ADMIN]);
    vi.mocked(mockPrisma.userRole as { findMany: ReturnType<typeof vi.fn> }).findMany.mockResolvedValueOnce([
      { role: Role.HR },
      { role: Role.EMPLOYEE },
    ]);
    vi.mocked(mockPrisma.subAdminPermission as { findUnique: ReturnType<typeof vi.fn> }).findUnique.mockResolvedValueOnce({
      id: "perm-1",
    });

    const res = await deleteSubAdminAction(TARGET_ID);
    expect(res.success).toBe(true);
    expect((mockPrisma.user as { delete: ReturnType<typeof vi.fn> }).delete).not.toHaveBeenCalled();
    expect((mockPrisma.userRole as { deleteMany: ReturnType<typeof vi.fn> }).deleteMany).toHaveBeenCalledWith({
      where: { userId: TARGET_ID, role: { in: [Role.HR, Role.MANAGER, Role.INTERVIEWER, Role.MENTOR] } },
    });
    expect((mockPrisma.session as { deleteMany: ReturnType<typeof vi.fn> }).deleteMany).toHaveBeenCalledWith({
      where: { userId: TARGET_ID },
    });
  });

  it("replaces only staff roles when permissions change", async () => {
    signInAs(ADMIN_ID, [Role.ADMIN]);
    const findUnique = vi.mocked(mockPrisma.user as { findUnique: ReturnType<typeof vi.fn> }).findUnique;
    findUnique.mockImplementation(async (args: { where: { id: string } }) => {
      if (args.where.id === TARGET_ID) {
        return { id: TARGET_ID, roles: [{ role: Role.HR }, { role: Role.EMPLOYEE }], subAdminPermission: null };
      }
      return args.where.id === ADMIN_ID
        ? { mustChangePassword: false, roles: [{ role: Role.ADMIN }] }
        : null;
    });

    const res = await updateSubAdminPermissionsAction({
      subAdminId: TARGET_ID,
      role: Role.MANAGER,
      permissions: fullPermissions,
    });
    expect(res.success).toBe(true);
    expect((mockPrisma.userRole as { deleteMany: ReturnType<typeof vi.fn> }).deleteMany).toHaveBeenCalledWith({
      where: { userId: TARGET_ID, role: { in: [Role.HR, Role.MANAGER, Role.INTERVIEWER, Role.MENTOR] } },
    });
  });

  it("blocks non-admins and temporary-password admins", async () => {
    signInAs(TARGET_ID, [Role.HR]);
    await expect(deleteSubAdminAction(ADMIN_ID)).resolves.toMatchObject({ success: false });

    signInAs(ADMIN_ID, [Role.ADMIN], true);
    await expect(deleteSubAdminAction(TARGET_ID)).resolves.toMatchObject({ success: false });
    expect((mockPrisma.userRole as { deleteMany: ReturnType<typeof vi.fn> }).deleteMany).not.toHaveBeenCalled();
  });
});

describe("Outbox cron route authorization", () => {
  it("rejects requests without the cron secret", async () => {
    const res = await outboxCron(new NextRequest("http://localhost/api/cron/outbox"));
    expect(res.status).toBe(401);
  });

  it("rejects a wrong bearer token", async () => {
    const res = await outboxCron(
      new NextRequest("http://localhost/api/cron/outbox", {
        headers: { authorization: "Bearer wrong-secret-0000000000" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("processes the outbox with the configured secret", async () => {
    const res = await outboxCron(
      new NextRequest("http://localhost/api/cron/outbox", {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      })
    );
    expect(res.status).toBe(200);
  });
});

describe("Payroll payout block is reserved for the payroll module", () => {
  it("detects the marker case-insensitively", async () => {
    const { containsPayoutProfileMarker } = await import("@/features/payroll/payout-notes");
    expect(containsPayoutProfileMarker('note payroll_profile:{"accountNumber":"1"}')).toBe(true);
    expect(containsPayoutProfileMarker("Joined via campus drive")).toBe(false);
  });

  it("strips bank account, PAN and amount before notes are shown elsewhere", async () => {
    const { stripPayoutProfile } = await import("@/features/payroll/payout-notes");
    const notes =
      'Prefers remote work.\n\nPAYROLL_PROFILE:{"isPaid":true,"accountNumber":"123456789012","panNumber":"ABCDE1234F","bankName":"A } B"}';
    const stripped = stripPayoutProfile(notes);
    expect(stripped).toBe("Prefers remote work.");
    expect(stripped).not.toContain("123456789012");
    expect(stripPayoutProfile('PAYROLL_PROFILE:{"accountNumber":"999')).toBeNull();
  });
});
