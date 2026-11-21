import { describe, it, expect, vi, beforeEach } from "vitest";

const { db, sessionState, sendMail, createTransport, runDueJobs, afterCallbacks } = vi.hoisted(() => {
  const db = {
    $queryRaw: vi.fn(),
    user: { findUnique: vi.fn() },
    application: { findMany: vi.fn() },
    opening: { findMany: vi.fn() },
    subAdminPermission: { findUnique: vi.fn() },
  };
  const sendMail = vi.fn(async () => ({ messageId: "message-1" }));
  return {
    db,
    sessionState: { current: null as null | { user: { id: string; email: string; name: string } } },
    sendMail,
    createTransport: vi.fn(() => ({ sendMail })),
    runDueJobs: vi.fn(async () => ({ claimed: 0, succeeded: 0, retried: 0, failed: 0, recoveredStale: 0 })),
    afterCallbacks: [] as (() => Promise<void>)[],
  };
});

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { getSession: vi.fn(async () => sessionState.current) } },
}));
vi.mock("@/infrastructure/storage", () => ({ getStorageService: vi.fn() }));
vi.mock("nodemailer", () => ({ createTransport }));
vi.mock("@/infrastructure/jobs/job-runner", () => ({ runDueJobs }));
vi.mock("@/features/automation/registry", () => ({
  automationHandlers: {},
  ensureRecurringJobs: vi.fn(async () => undefined),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (callback: () => Promise<void>) => {
    afterCallbacks.push(callback);
  },
}));

import * as prismaClient from "@prisma/client";
import * as clientEnums from "@/types/enums";
import { getCurrentUser, requireAuth, type AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { applicationService } from "@/features/applications/services/application-service";
import { ADMIN_OPENINGS_LIMIT, getAdminOpenings } from "@/features/openings/services/opening-service";
import { NodemailerEmailAdapter, outboxProcessorService } from "@/infrastructure/email/outbox-processor";
import { VectorPdfBuilder } from "@/infrastructure/pdf/vector-pdf-builder";
import { runAutomation } from "@/features/automation/run-automation";
import { scheduleAutomationTick } from "@/features/automation/heartbeat";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function signIn() {
  sessionState.current = { user: { id: USER_ID, email: "asha@gara.test", name: "Asha Rao" } };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionState.current = null;
});

describe("getCurrentUser loads the password flag and roles in one statement", () => {
  it("issues a single parameterised query and no Prisma relation reads", async () => {
    signIn();
    db.$queryRaw.mockResolvedValue([{ mustChangePassword: false, roles: ["HR", "MENTOR"] }]);

    await expect(getCurrentUser()).resolves.toEqual({
      id: USER_ID,
      email: "asha@gara.test",
      name: "Asha Rao",
      roles: ["HR", "MENTOR"],
      mustChangePassword: false,
    });

    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = db.$queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    // The user id is a bound parameter, never part of the SQL text.
    expect(values).toEqual([USER_ID]);
    const sql = strings.join("$1");
    expect(sql).not.toContain(USER_ID);
    expect(sql).toContain('FROM "users" u');
    expect(sql).toContain('FROM "user_roles" ur');
    // Enum roles are returned as text so the driver yields a plain string array.
    expect(sql).toContain('ur."role"::text');
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("treats a user without roles as CANDIDATE and keeps the temporary-password flag", async () => {
    signIn();
    db.$queryRaw.mockResolvedValue([{ mustChangePassword: true, roles: [] }]);

    const user = await getCurrentUser();
    expect(user?.roles).toEqual(["CANDIDATE"]);
    expect(user?.mustChangePassword).toBe(true);
    await expect(requireAuth()).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requireAuth({ allowPendingPasswordChange: true })).resolves.toMatchObject({ id: USER_ID });
  });

  it("returns null without a session, for a deleted user and when the lookup fails", async () => {
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(db.$queryRaw).not.toHaveBeenCalled();

    signIn();
    db.$queryRaw.mockResolvedValueOnce([]);
    await expect(getCurrentUser()).resolves.toBeNull();

    db.$queryRaw.mockRejectedValueOnce(new Error("connection reset"));
    await expect(getCurrentUser()).resolves.toBeNull();
  });
});

describe("client-safe enums (@/types/enums) mirror @prisma/client", () => {
  it.each(Object.keys(clientEnums))("%s has exactly the Prisma values", (name) => {
    const prismaEnum = (prismaClient as Record<string, unknown>)[name];
    expect(prismaEnum).toBeDefined();
    expect((clientEnums as Record<string, unknown>)[name]).toEqual(prismaEnum);
  });
});

describe("list queries stay small", () => {
  const admin: AuthenticatedUser = { id: USER_ID, email: "admin@gara.test", name: "Admin", roles: ["ADMIN"] };

  it("lists a candidate's applications in one ownership-filtered query", async () => {
    const createdAt = new Date("2026-10-01T10:00:00.000Z");
    db.application.findMany.mockResolvedValue([
      {
        id: "app-1",
        referenceCode: "GARA-1",
        status: "SUBMITTED",
        createdAt,
        updatedAt: createdAt,
        opening: { id: "o-1", title: "Intern", slug: "intern", department: "Eng", type: "INTERNSHIP", location: "Remote" },
      },
    ]);

    const result = await applicationService.getCandidateApplications(USER_ID);

    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.application.findMany).toHaveBeenCalledTimes(1);
    const args = db.application.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ candidate: { userId: USER_ID }, isArchived: false });
    expect(Object.keys(args.select).sort()).toEqual(
      ["createdAt", "id", "opening", "referenceCode", "status", "updatedAt"].sort()
    );
    expect(result).toEqual([
      {
        id: "app-1",
        referenceCode: "GARA-1",
        status: "SUBMITTED",
        createdAt,
        updatedAt: createdAt,
        opening: { id: "o-1", title: "Intern", slug: "intern", department: "Eng", type: "INTERNSHIP", location: "Remote" },
      },
    ]);
  });

  it("lists staff openings bounded, with table columns and only the live form version", async () => {
    db.opening.findMany.mockResolvedValue([]);
    await getAdminOpenings(admin);

    const args = db.opening.findMany.mock.calls[0][0];
    expect(args.take).toBe(ADMIN_OPENINGS_LIMIT);
    expect(args.include).toBeUndefined();
    expect(Object.keys(args.select).sort()).toEqual(
      ["_count", "applyDeadline", "department", "formVersions", "id", "location", "slug", "status", "title", "track", "type", "workplaceType"].sort()
    );
    // Only the track label and the application count, never the applications themselves.
    expect(args.select.track).toEqual({ select: { name: true, slug: true } });
    expect(args.select._count).toEqual({ select: { applications: true } });
    expect(args.select.formVersions).toEqual({
      where: { isPublished: true },
      select: { id: true, versionNumber: true, isPublished: true },
      orderBy: { versionNumber: "desc" },
      take: 1,
    });
  });
});

describe("cold-start work is deferred and reused", () => {
  it("creates one pooled SMTP transporter on the first send and reuses it", async () => {
    const adapter = new NodemailerEmailAdapter();
    await adapter.sendEmail({ to: "a@gara.test", subject: "One", text: "First" });
    await new NodemailerEmailAdapter().sendEmail({ to: "b@gara.test", subject: "Two", text: "Second" });

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ pool: true }));
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail).toHaveBeenLastCalledWith(expect.objectContaining({ to: "b@gara.test", subject: "Two" }));
  });

  it("renders a certificate with the QR code library loaded on demand", async () => {
    const pdf = await VectorPdfBuilder.buildCertificate({
      recipientName: "Asha Rao",
      programmeTitle: "Software Engineering Internship",
      completionDate: "2026-10-31",
      issueDate: "2026-11-01",
      verificationCode: "GARA-CERT-0001",
      verificationUrl: "https://gara.test/verify?code=GARA-CERT-0001",
      signatoryName: "Signatory",
      signatoryTitle: "Director",
    });
    expect(pdf.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("delivers 50 queued emails per scheduled run and 10 per traffic-triggered tick", async () => {
    const batch = vi
      .spyOn(outboxProcessorService, "processPendingBatch")
      .mockResolvedValue({ processed: 0, sent: 0, failed: 0, skippedAlreadySent: 0, exhaustedMaxAttempts: 0 });

    await runAutomation({ limit: 50 });
    expect(batch).toHaveBeenLastCalledWith(50);

    afterCallbacks.length = 0;
    scheduleAutomationTick();
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]();
    expect(runDueJobs).toHaveBeenLastCalledWith({}, expect.objectContaining({ limit: 15 }));
    expect(batch).toHaveBeenLastCalledWith(10);
    batch.mockRestore();
  });
});
