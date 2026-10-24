import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma, mockSession } = vi.hoisted(() => {
  const prisma = {
    user: { findUnique: vi.fn() },
    subAdminPermission: { findUnique: vi.fn() },
    opening: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    openingFormVersion: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    mockPrisma: prisma,
    mockSession: {
      current: null as null | { user: { id: string; email: string; name: string } },
    },
  };
});

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { getSession: vi.fn(async () => mockSession.current) } },
}));

import {
  createOpeningSchema,
  VALID_STATUS_TRANSITIONS,
} from "@/features/openings/schemas";
import {
  formSchemaDefinitionSchema,
  formFieldDefinitionSchema,
} from "@/features/application-forms/schemas";
import { getDefaultApplicationFormSchema } from "@/features/application-forms/default-form";
import { OpeningStatus, OpeningType, Role, WorkplaceType } from "@prisma/client";
import {
  createOpening,
  getAdminOpenings,
  saveOpeningFormVersion,
  updateOpening,
  updateOpeningStatus,
} from "@/features/openings/services/opening-service";
import {
  createOpeningAction,
  saveOpeningFormVersionAction,
  updateOpeningStatusAction,
} from "@/features/openings/actions";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/errors";

describe("features/openings/schemas", () => {
  it("validates valid opening input successfully", () => {
    const validData = {
      title: "Frontend Engineering Intern",
      slug: "frontend-engineering-intern",
      department: "Web Platform",
      type: OpeningType.INTERNSHIP,
      location: "Bengaluru, India",
      workplaceType: WorkplaceType.REMOTE,
      description: "Join GARA Innovation to build high-performance accessible frontend systems.",
      requirements: "Experience with React, TypeScript, and modern CSS frameworks.",
    };

    const parsed = createOpeningSchema.safeParse(validData);
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid slugs containing spaces or uppercase characters", () => {
    const invalidData = {
      title: "Backend Engineer",
      slug: "Backend Engineer 2026!",
      department: "Core Systems",
      type: OpeningType.FULL_TIME,
      location: "Bengaluru",
      workplaceType: WorkplaceType.HYBRID,
      description: "Build robust scalable distributed services for GARA Innovation.",
      requirements: "Strong background in PostgreSQL, Node.js, and API design.",
    };

    const parsed = createOpeningSchema.safeParse(invalidData);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const slugError = parsed.error.format().slug?._errors;
      expect(slugError).toBeDefined();
    }
  });

  it("enforces strict lifecycle status transitions", () => {
    // Valid transitions
    expect(VALID_STATUS_TRANSITIONS[OpeningStatus.DRAFT]).toContain(OpeningStatus.PUBLISHED);
    expect(VALID_STATUS_TRANSITIONS[OpeningStatus.PUBLISHED]).toContain(OpeningStatus.PAUSED);
    expect(VALID_STATUS_TRANSITIONS[OpeningStatus.PUBLISHED]).toContain(OpeningStatus.CLOSED);
    expect(VALID_STATUS_TRANSITIONS[OpeningStatus.PAUSED]).toContain(OpeningStatus.PUBLISHED);

    // Invalid transitions
    expect(VALID_STATUS_TRANSITIONS[OpeningStatus.DRAFT]).not.toContain(OpeningStatus.PAUSED);
    expect(VALID_STATUS_TRANSITIONS[OpeningStatus.DRAFT]).not.toContain(OpeningStatus.CLOSED);
    expect(VALID_STATUS_TRANSITIONS[OpeningStatus.CLOSED]).toEqual([]);
  });
});

describe("features/application-forms/schemas", () => {
  it("validates default application form schema structure", () => {
    const defaultSchema = getDefaultApplicationFormSchema("INTERNSHIP");
    const parsed = formSchemaDefinitionSchema.safeParse(defaultSchema);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      const resumeSection = defaultSchema.sections.find((s) => s.id === "documents-upload");
      expect(resumeSection).toBeDefined();
      const resumeField = resumeSection?.fields.find((f) => f.name === "resume");
      expect(resumeField?.type).toBe("file");
      expect(resumeField?.required).toBe(true);
      expect(resumeField?.validation?.maxFileSizeMb).toBe(5);
    }
  });

  it("rejects field definitions with invalid naming patterns", () => {
    const invalidField = {
      id: "field-1",
      name: "invalid name with spaces & symbols!",
      label: "My Question",
      type: "text",
      required: false,
      order: 1,
    };

    const parsed = formFieldDefinitionSchema.safeParse(invalidField);
    expect(parsed.success).toBe(false);
  });
});

describe("form definition integrity", () => {
  const field = (name: string) => ({
    id: `id-${name}`,
    name,
    label: name,
    type: "text" as const,
    required: false,
    order: 1,
  });

  it("rejects duplicate field names across sections", () => {
    const parsed = formSchemaDefinitionSchema.safeParse({
      sections: [
        { id: "a", title: "A", order: 1, fields: [field("email")] },
        { id: "b", title: "B", order: 2, fields: [field("email")] },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects invalid or oversized validation patterns", () => {
    expect(
      formFieldDefinitionSchema.safeParse({ ...field("code"), validation: { pattern: "([a-z" } })
        .success
    ).toBe(false);
    expect(
      formFieldDefinitionSchema.safeParse({
        ...field("code"),
        validation: { pattern: "a".repeat(201) },
      }).success
    ).toBe(false);
    expect(
      formFieldDefinitionSchema.safeParse({ ...field("code"), validation: { pattern: "^[A-Z]{3}$" } })
        .success
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Opening service authorization (SEC-05, BUG-18) and atomic transitions (BUG-11)
// ---------------------------------------------------------------------------

const OPENING_ID = "33333333-3333-4333-8333-333333333333";

const user = (id: string, roles: Role[]): AuthenticatedUser => ({
  id,
  email: `${id}@gara.test`,
  name: id,
  roles,
});
const admin = user("admin-1", [Role.ADMIN]);
const hr = user("hr-1", [Role.HR]);
const manager = user("manager-1", [Role.MANAGER]);
const mentor = user("mentor-1", [Role.MENTOR]);
const candidate = user("candidate-1", [Role.CANDIDATE]);

function permissionRow(userId: string, canOpenings: boolean) {
  return {
    id: `perm-${userId}`,
    userId,
    canApplications: false,
    canOpenings,
    canInterviews: false,
    canEvaluations: false,
    canEmployees: false,
    canAttendance: false,
    canLeave: false,
    canPayroll: false,
    canReports: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function draftOpening(overrides: Record<string, unknown> = {}) {
  return {
    id: OPENING_ID,
    title: "Frontend Intern",
    slug: "frontend-intern",
    status: OpeningStatus.DRAFT,
    activeFormVersionId: null,
    updatedAt: new Date("2026-10-01T00:00:00Z"),
    ...overrides,
  };
}

function resetDb() {
  vi.clearAllMocks();
  mockSession.current = null;
  mockPrisma.subAdminPermission.findUnique.mockResolvedValue(null);
  mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => unknown) =>
    cb(mockPrisma)
  );
  mockPrisma.opening.findMany.mockResolvedValue([]);
  mockPrisma.auditLog.create.mockResolvedValue({ id: "audit-1" });
}

describe("opening access follows the canOpenings permission", () => {
  beforeEach(resetDb);

  it("allows ADMIN and HR (role default) to list openings", async () => {
    await expect(getAdminOpenings(admin)).resolves.toEqual([]);
    await expect(getAdminOpenings(hr)).resolves.toEqual([]);
  });

  it("allows a MANAGER who was granted canOpenings instead of crashing (BUG-18)", async () => {
    mockPrisma.subAdminPermission.findUnique.mockResolvedValueOnce(permissionRow(manager.id, true));
    await expect(getAdminOpenings(manager)).resolves.toEqual([]);
  });

  it("refuses staff without canOpenings, including HR whose permission was revoked", async () => {
    await expect(getAdminOpenings(manager)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getAdminOpenings(mentor)).rejects.toBeInstanceOf(ForbiddenError);
    mockPrisma.subAdminPermission.findUnique.mockResolvedValueOnce(permissionRow(hr.id, false));
    await expect(getAdminOpenings(hr)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses candidates on every mutation entry point", async () => {
    await expect(
      createOpening(
        {
          title: "X Intern",
          slug: "x-intern",
          department: "Web",
          type: OpeningType.INTERNSHIP,
          location: "Remote",
          workplaceType: WorkplaceType.REMOTE,
          description: "A sufficiently long description of the role.",
          requirements: "Some requirements here",
        },
        candidate
      )
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateOpening(OPENING_ID, { title: "New" }, candidate)).rejects.toBeInstanceOf(
      ForbiddenError
    );
    await expect(
      updateOpeningStatus(OPENING_ID, OpeningStatus.PUBLISHED, candidate)
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      saveOpeningFormVersion(OPENING_ID, getDefaultApplicationFormSchema(), true, candidate)
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns ValidationError (not a raw ZodError) for invalid opening input", async () => {
    await expect(
      createOpening({ title: "x" } as Parameters<typeof createOpening>[0], admin)
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("updateOpeningStatus", () => {
  beforeEach(resetDb);

  it("rejects transitions outside the state machine", async () => {
    mockPrisma.opening.findUnique.mockResolvedValue(draftOpening());
    await expect(updateOpeningStatus(OPENING_ID, OpeningStatus.CLOSED, admin)).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(mockPrisma.opening.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("refuses to publish an opening without any form version", async () => {
    mockPrisma.opening.findUnique.mockResolvedValue(draftOpening());
    mockPrisma.openingFormVersion.findFirst.mockResolvedValue(null);
    await expect(
      updateOpeningStatus(OPENING_ID, OpeningStatus.PUBLISHED, admin)
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mockPrisma.opening.updateMany).not.toHaveBeenCalled();
  });

  it("publishes atomically with a conditional update, auto-publishing the latest form and auditing", async () => {
    mockPrisma.opening.findUnique.mockResolvedValue(draftOpening());
    mockPrisma.openingFormVersion.findFirst
      .mockResolvedValueOnce(null) // no published version yet
      .mockResolvedValueOnce({ id: "form-v2" }); // latest version
    mockPrisma.opening.updateMany.mockResolvedValue({ count: 1 });

    const result = await updateOpeningStatus(OPENING_ID, OpeningStatus.PUBLISHED, hr);

    expect(result.status).toBe(OpeningStatus.PUBLISHED);
    expect(mockPrisma.openingFormVersion.update).toHaveBeenCalledWith({
      where: { id: "form-v2" },
      data: { isPublished: true },
    });
    expect(mockPrisma.opening.updateMany).toHaveBeenCalledWith({
      where: { id: OPENING_ID, status: OpeningStatus.DRAFT },
      data: { status: OpeningStatus.PUBLISHED, activeFormVersionId: "form-v2" },
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "OPENING_STATUS_CHANGED",
        diffPayload: { fromStatus: OpeningStatus.DRAFT, toStatus: OpeningStatus.PUBLISHED },
      }),
    });
  });

  it("fails with a conflict when another request changed the status first", async () => {
    mockPrisma.opening.findUnique.mockResolvedValue(
      draftOpening({ status: OpeningStatus.PUBLISHED })
    );
    mockPrisma.opening.updateMany.mockResolvedValue({ count: 0 });

    await expect(updateOpeningStatus(OPENING_ID, OpeningStatus.PAUSED, admin)).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("is a no-op when the status is unchanged", async () => {
    mockPrisma.opening.findUnique.mockResolvedValue(draftOpening());
    const result = await updateOpeningStatus(OPENING_ID, OpeningStatus.DRAFT, admin);
    expect(result.status).toBe(OpeningStatus.DRAFT);
    expect(mockPrisma.opening.updateMany).not.toHaveBeenCalled();
  });
});

describe("updateOpening", () => {
  beforeEach(resetDb);

  it("updates and audits inside one transaction", async () => {
    mockPrisma.opening.findUnique.mockResolvedValueOnce(draftOpening());
    mockPrisma.opening.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.opening.findUniqueOrThrow.mockResolvedValue(draftOpening({ title: "Renamed" }));

    const updated = await updateOpening(OPENING_ID, { title: "Renamed role" }, admin);

    expect(updated.title).toBe("Renamed");
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "OPENING_UPDATED", resourceId: OPENING_ID }),
    });
  });

  it("rejects a slug already used by another opening", async () => {
    mockPrisma.opening.findUnique
      .mockResolvedValueOnce(draftOpening())
      .mockResolvedValueOnce({ id: "other" });
    await expect(updateOpening(OPENING_ID, { slug: "taken-slug" }, admin)).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(mockPrisma.opening.updateMany).not.toHaveBeenCalled();
  });
});

describe("saveOpeningFormVersion", () => {
  beforeEach(resetDb);

  const schema = getDefaultApplicationFormSchema("INTERNSHIP");

  it("updates an unpublished draft in place with a conditional write and an audit row", async () => {
    mockPrisma.opening.findUnique.mockResolvedValue({
      ...draftOpening(),
      formVersions: [{ id: "form-v1", versionNumber: 1, isPublished: false }],
    });
    mockPrisma.openingFormVersion.updateMany.mockResolvedValue({ count: 1 });

    const saved = await saveOpeningFormVersion(OPENING_ID, schema, false, admin);

    expect(saved.versionNumber).toBe(1);
    expect(mockPrisma.openingFormVersion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "form-v1", isPublished: false } })
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "FORM_VERSION_UPDATED", resourceId: "form-v1" }),
    });
  });

  it("never modifies a draft that was published concurrently", async () => {
    mockPrisma.opening.findUnique.mockResolvedValue({
      ...draftOpening(),
      formVersions: [{ id: "form-v1", versionNumber: 1, isPublished: false }],
    });
    mockPrisma.openingFormVersion.updateMany.mockResolvedValue({ count: 0 });

    await expect(saveOpeningFormVersion(OPENING_ID, schema, true, admin)).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("creates a new version instead of editing a published one (form version immutability)", async () => {
    mockPrisma.opening.findUnique.mockResolvedValue({
      ...draftOpening({ status: OpeningStatus.PUBLISHED }),
      formVersions: [{ id: "form-v3", versionNumber: 3, isPublished: true }],
    });
    mockPrisma.openingFormVersion.create.mockResolvedValue({
      id: "form-v4",
      versionNumber: 4,
      isPublished: true,
    });

    const saved = await saveOpeningFormVersion(OPENING_ID, schema, true, hr);

    expect(saved.versionNumber).toBe(4);
    expect(mockPrisma.openingFormVersion.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.openingFormVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ versionNumber: 4, openingId: OPENING_ID }),
    });
  });

  it("maps a concurrent version-number collision to a conflict", async () => {
    mockPrisma.opening.findUnique.mockResolvedValue({
      ...draftOpening({ status: OpeningStatus.PUBLISHED }),
      formVersions: [{ id: "form-v3", versionNumber: 3, isPublished: true }],
    });
    mockPrisma.openingFormVersion.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
    );

    await expect(saveOpeningFormVersion(OPENING_ID, schema, true, admin)).rejects.toBeInstanceOf(
      ConflictError
    );
  });
});

// ---------------------------------------------------------------------------
// Openings Server Actions (SEC-05, SEC-20)
// ---------------------------------------------------------------------------

function signInAs(signedIn: AuthenticatedUser) {
  mockSession.current = {
    user: { id: signedIn.id, email: signedIn.email, name: signedIn.name },
  };
  mockPrisma.user.findUnique.mockImplementation(async (args: { where: { id: string } }) =>
    args.where.id === signedIn.id
      ? { mustChangePassword: false, roles: signedIn.roles.map((role) => ({ role })) }
      : null
  );
}

describe("openings Server Actions", () => {
  beforeEach(resetDb);

  it("require authentication", async () => {
    const result = await updateOpeningStatusAction(OPENING_ID, OpeningStatus.PUBLISHED);
    expect(result).toEqual({
      success: false,
      error: "You must be logged in to access this resource",
    });
  });

  it("refuse users without canOpenings", async () => {
    signInAs(candidate);
    const result = await updateOpeningStatusAction(OPENING_ID, OpeningStatus.PUBLISHED);
    expect(result).toEqual({
      success: false,
      error: "You do not have permission to access this module.",
    });

    signInAs(manager); // MANAGER default: canOpenings = false
    const formResult = await saveOpeningFormVersionAction(OPENING_ID, getDefaultApplicationFormSchema());
    expect(formResult.success).toBe(false);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("validate identifiers and status values at the boundary", async () => {
    signInAs(admin);
    const badId = await updateOpeningStatusAction("../../etc", OpeningStatus.PUBLISHED);
    expect(badId).toEqual({ success: false, error: "Invalid opening identifier" });

    const badStatus = await updateOpeningStatusAction(
      OPENING_ID,
      "ARCHIVED" as unknown as OpeningStatus
    );
    expect(badStatus.success).toBe(false);
    expect(mockPrisma.opening.findUnique).not.toHaveBeenCalled();
  });

  it("do not leak internal error messages", async () => {
    signInAs(admin);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockPrisma.opening.findUnique.mockRejectedValue(new Error("relation \"openings\" does not exist"));

    const result = await createOpeningAction({
      title: "Backend Intern",
      slug: "backend-intern",
      department: "Platform",
      type: OpeningType.INTERNSHIP,
      location: "Remote",
      workplaceType: WorkplaceType.REMOTE,
      description: "Build reliable services for the GARA platform.",
      requirements: "TypeScript and SQL basics",
    });
    expect(result).toEqual({ success: false, error: "The opening could not be created." });
    consoleError.mockRestore();
  });

  it("return a minimal payload on success", async () => {
    signInAs(admin);
    mockPrisma.opening.findUnique.mockResolvedValue(
      draftOpening({ status: OpeningStatus.PUBLISHED })
    );
    mockPrisma.opening.updateMany.mockResolvedValue({ count: 1 });

    const result = await updateOpeningStatusAction(OPENING_ID, OpeningStatus.PAUSED);
    expect(result).toEqual({
      success: true,
      data: { id: OPENING_ID, slug: "frontend-intern", status: OpeningStatus.PAUSED },
    });
  });
});
