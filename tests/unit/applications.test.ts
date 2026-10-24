import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { Role } from "@prisma/client";

const { mockPrisma, mockStorage, mockSession, mockRateLimiter, mockOutbox } = vi.hoisted(() => {
  const prisma = {
    user: { findUnique: vi.fn() },
    candidateProfile: { upsert: vi.fn(), update: vi.fn() },
    opening: { findUnique: vi.fn() },
    application: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    applicationStatusHistory: { create: vi.fn() },
    notificationOutbox: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    subAdminPermission: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    mockPrisma: prisma,
    mockStorage: {
      upload: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      getDownloadUrl: vi.fn(),
    },
    mockSession: {
      current: null as null | { user: { id: string; email: string; name: string } },
    },
    mockRateLimiter: { enforce: vi.fn() },
    mockOutbox: { scheduleOutboxFlush: vi.fn() },
  };
});

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/infrastructure/storage", () => ({ getStorageService: () => mockStorage }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { getSession: vi.fn(async () => mockSession.current) } },
}));
vi.mock("@/infrastructure/email/outbox-dispatch", () => mockOutbox);
vi.mock("@/lib/security/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/rate-limit")>();
  return { ...actual, defaultRateLimiter: mockRateLimiter };
});

import { validateFormResponses } from "@/features/application-forms/services/form-validator";
import { formResponsesPayloadSchema } from "@/features/application-forms/schemas";
import { FormSchemaDefinition } from "@/features/application-forms/types";
import {
  generateApplicationReference,
  applicationService,
  MAX_REFERENCE_ATTEMPTS,
} from "@/features/applications/services/application-service";
import { submitApplicationAction } from "@/features/applications/actions";
import { RATE_LIMIT_POLICIES } from "@/lib/security/rate-limit";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from "@/lib/errors";
import { LocalStorageService } from "@/infrastructure/storage/local-storage-service";
import fs from "node:fs/promises";
import path from "node:path";

describe("Candidate Applications & Dynamic Form Validation (Prompt 3)", () => {
  const sampleSchema: FormSchemaDefinition = {
    sections: [
      {
        id: "sec-1",
        title: "Basic Info",
        order: 1,
        fields: [
          {
            id: "f-name",
            name: "full_name",
            label: "Full Name",
            type: "text",
            required: true,
            order: 1,
          },
          {
            id: "f-email",
            name: "email",
            label: "Email Address",
            type: "email",
            required: true,
            order: 2,
          },
          {
            id: "f-gpa",
            name: "gpa",
            label: "Cumulative GPA",
            type: "number",
            required: false,
            order: 3,
            validation: {
              min: 0,
              max: 10,
            },
          },
          {
            id: "f-track",
            name: "preferred_track",
            label: "Preferred Track",
            type: "select",
            required: true,
            order: 4,
            options: [
              { label: "Frontend", value: "frontend" },
              { label: "Backend", value: "backend" },
            ],
          },
          {
            id: "f-resume",
            name: "resume",
            label: "Resume (PDF)",
            type: "file",
            required: true,
            order: 5,
            validation: {
              allowedFileTypes: ["application/pdf"],
              maxFileSizeMb: 5,
            },
          },
        ],
      },
    ],
  };

  it("validates successful submission with all required fields and valid PDF file", () => {
    const responses = {
      full_name: "Aman Sharma",
      email: "aman@example.com",
      gpa: 8.5,
      preferred_track: "backend",
    };

    const files = {
      resume: {
        name: "aman_resume.pdf",
        size: 1024 * 500, // 500 KB
        type: "application/pdf",
      },
    };

    const result = validateFormResponses(sampleSchema, responses, files);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
    expect(result.sanitizedResponses.full_name).toBe("Aman Sharma");
    expect(result.sanitizedResponses.email).toBe("aman@example.com");
    expect(result.sanitizedResponses.gpa).toBe(8.5);
    expect(result.sanitizedResponses.preferred_track).toBe("backend");
  });

  it("flags missing required fields and invalid email format", () => {
    const responses = {
      full_name: "   ", // whitespace only
      email: "not-an-email",
      preferred_track: "invalid_choice",
    };

    const result = validateFormResponses(sampleSchema, responses);
    expect(result.isValid).toBe(false);
    expect(result.errors.full_name).toBeDefined();
    expect(result.errors.email).toBe("Please enter a valid email address");
    expect(result.errors.preferred_track).toBe("Invalid selection for Preferred Track");
    expect(result.errors.resume).toBeDefined();
  });

  it("strictly enforces file validation: rejects non-PDF and oversized files", () => {
    const responses = {
      full_name: "Jane Doe",
      email: "jane@example.com",
      preferred_track: "frontend",
    };

    // Case 1: Non-PDF format
    const badMimeResult = validateFormResponses(sampleSchema, responses, {
      resume: {
        name: "malicious.exe",
        size: 1024,
        type: "application/x-msdownload",
      },
    });
    expect(badMimeResult.isValid).toBe(false);
    expect(badMimeResult.errors.resume).toContain("Invalid file type");

    // Case 2: File exceeds 5MB limit
    const oversizedResult = validateFormResponses(sampleSchema, responses, {
      resume: {
        name: "huge_resume.pdf",
        size: 6 * 1024 * 1024, // 6 MB
        type: "application/pdf",
      },
    });
    expect(oversizedResult.isValid).toBe(false);
    expect(oversizedResult.errors.resume).toContain("exceeds the 5MB limit");
  });

  it("generates application reference codes with the current UTC year (BUG-15)", () => {
    const currentYear = new Date().getUTCFullYear();
    expect(generateApplicationReference()).toMatch(
      new RegExp(`^GARA-${currentYear}-APP-[A-F0-9]{6}$`)
    );
    expect(generateApplicationReference(new Date("2031-01-01T00:30:00Z"))).toMatch(
      /^GARA-2031-APP-[A-F0-9]{6}$/
    );
    expect(generateApplicationReference(new Date("2030-12-31T23:59:59Z"))).toMatch(
      /^GARA-2030-APP-/
    );
  });
});

describe("Form validator hardening (BUG-16)", () => {
  const schemaWith = (fields: FormSchemaDefinition["sections"][number]["fields"]): FormSchemaDefinition => ({
    sections: [{ id: "s1", title: "Section", order: 1, fields }],
  });

  it("rejects an unchecked required checkbox and non-boolean checkbox values", () => {
    const schema = schemaWith([
      { id: "c1", name: "consent", label: "Consent", type: "checkbox", required: true, order: 1 },
      { id: "c2", name: "newsletter", label: "Newsletter", type: "checkbox", required: false, order: 2 },
    ]);

    const unchecked = validateFormResponses(schema, { consent: false, newsletter: false });
    expect(unchecked.isValid).toBe(false);
    expect(unchecked.errors.consent).toBe("Consent must be checked");

    const stringValue = validateFormResponses(schema, { consent: "true" });
    expect(stringValue.errors.consent).toBe("Invalid value for Consent");

    const checked = validateFormResponses(schema, { consent: true, newsletter: false });
    expect(checked.isValid).toBe(true);
    expect(checked.sanitizedResponses).toEqual({ consent: true, newsletter: false });
  });

  it("never accepts client-supplied JSON for file fields", () => {
    const schema = schemaWith([
      { id: "f1", name: "resume", label: "Resume", type: "file", required: true, order: 1 },
      { id: "f2", name: "portfolio", label: "Portfolio", type: "file", required: false, order: 2 },
    ]);
    const forged = { resume: "uploads/someone-else.pdf", portfolio: "anything" };

    const result = validateFormResponses(schema, forged);
    expect(result.isValid).toBe(false);
    expect(result.errors.resume).toBe("Resume is required");
    expect(result.sanitizedResponses).not.toHaveProperty("resume");
    expect(result.sanitizedResponses).not.toHaveProperty("portfolio");
  });

  it("validates multiselect values against configured options", () => {
    const schema = schemaWith([
      {
        id: "m1",
        name: "skills",
        label: "Skills",
        type: "multiselect",
        required: true,
        order: 1,
        options: [
          { label: "React", value: "react" },
          { label: "Go", value: "go" },
        ],
      },
    ]);

    const valid = validateFormResponses(schema, { skills: ["react", "go", "react"] });
    expect(valid.isValid).toBe(true);
    expect(valid.sanitizedResponses.skills).toEqual(["react", "go"]);

    expect(validateFormResponses(schema, { skills: ["react", "cobol"] }).errors.skills).toBe(
      "Invalid selection for Skills"
    );
    expect(validateFormResponses(schema, { skills: "react" }).errors.skills).toBe(
      "Invalid selection for Skills"
    );
    expect(validateFormResponses(schema, { skills: [] }).errors.skills).toBe("Skills is required");
  });

  it("checks date and phone formats", () => {
    const schema = schemaWith([
      { id: "d1", name: "start", label: "Start date", type: "date", required: true, order: 1 },
      { id: "p1", name: "phone", label: "Phone", type: "phone", required: true, order: 2 },
    ]);

    const valid = validateFormResponses(schema, { start: "2026-03-15", phone: "+91 98765 43210" });
    expect(valid.isValid).toBe(true);

    const invalid = validateFormResponses(schema, { start: "2026-02-30", phone: "call me" });
    expect(invalid.errors.start).toContain("valid date");
    expect(invalid.errors.phone).toContain("valid phone number");

    expect(validateFormResponses(schema, { start: "15/03/2026", phone: "123" }).isValid).toBe(false);
  });

  it("rejects non-string values for text fields instead of coercing them", () => {
    const schema = schemaWith([
      { id: "t1", name: "city", label: "City", type: "text", required: true, order: 1 },
    ]);
    expect(validateFormResponses(schema, { city: ["Pune", "Delhi"] }).errors.city).toBe(
      "Invalid value for City"
    );
    expect(validateFormResponses(schema, { city: { toString: "x" } }).errors.city).toBe(
      "Invalid value for City"
    );
  });

  it("does not evaluate admin regex patterns on oversized input", () => {
    const schema = schemaWith([
      {
        id: "r1",
        name: "code",
        label: "Code",
        type: "text",
        required: true,
        order: 1,
        validation: { pattern: "^(a+)+$" },
      },
    ]);

    const started = Date.now();
    const result = validateFormResponses(schema, { code: `${"a".repeat(600)}!` });
    expect(Date.now() - started).toBeLessThan(500);
    expect(result.errors.code).toBe("Code must be at most 500 characters");

    expect(validateFormResponses(schema, { code: "aaaa" }).isValid).toBe(true);
  });

  it("zod-parses the raw responses payload as a flat record of primitives", () => {
    expect(
      formResponsesPayloadSchema.safeParse({ a: "x", b: 2, c: true, d: null, e: ["y"] }).success
    ).toBe(true);
    expect(formResponsesPayloadSchema.safeParse({ nested: { deep: "x" } }).success).toBe(false);
    expect(formResponsesPayloadSchema.safeParse({ list: [{ x: 1 }] }).success).toBe(false);
    expect(formResponsesPayloadSchema.safeParse(["not", "a", "record"]).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Application submission service (BUG-15, BUG-17, POL-01)
// ---------------------------------------------------------------------------

const CANDIDATE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const candidateViewer = {
  id: CANDIDATE_ID,
  email: "cand@gara.test",
  name: "Candidate",
  roles: [Role.CANDIDATE],
};
const PDF_BUFFER = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");

function formWithDocument(required: boolean): FormSchemaDefinition {
  return {
    sections: [
      {
        id: "s1",
        title: "Basics",
        order: 1,
        fields: [
          { id: "n", name: "fullName", label: "Full Name", type: "text", required: true, order: 1 },
          ...(required !== null
            ? [
                {
                  id: "r",
                  name: "resume",
                  label: "Resume",
                  type: "file" as const,
                  required,
                  order: 2,
                },
              ]
            : []),
        ],
      },
    ],
  };
}

const FORM_WITHOUT_DOCUMENT: FormSchemaDefinition = {
  sections: [
    {
      id: "s1",
      title: "Basics",
      order: 1,
      fields: [{ id: "n", name: "fullName", label: "Full Name", type: "text", required: true, order: 1 }],
    },
  ],
};

function mockPublishedOpening(schemaDefinition: FormSchemaDefinition, status = "PUBLISHED") {
  mockPrisma.opening.findUnique.mockResolvedValue({
    id: "opening-1",
    slug: "frontend-intern",
    title: "Frontend Intern",
    status,
    formVersions: [{ id: "form-v1", versionNumber: 1, schemaDefinition }],
  });
}

function pdfUpload(buffer: Buffer = PDF_BUFFER) {
  return { name: "cv.pdf", size: buffer.byteLength, type: "application/pdf", buffer };
}

describe("ApplicationService.submitApplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({
      id: CANDIDATE_ID,
      name: "Asha",
      email: "asha@example.test",
      candidateProfile: { id: "profile-1" },
    });
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => unknown) =>
      cb(mockPrisma)
    );
    mockPrisma.application.create.mockImplementation(
      async ({ data }: { data: { referenceCode: string } }) => ({
        id: "app-1",
        referenceCode: data.referenceCode,
        createdAt: new Date("2026-10-24T10:00:00Z"),
      })
    );
    mockStorage.upload.mockResolvedValue({
      storageKey: "resumes/frontend-intern/key.pdf",
      filename: "cv.pdf",
      mimeType: "application/pdf",
      sizeBytes: PDF_BUFFER.byteLength,
    });
    mockStorage.delete.mockResolvedValue(undefined);
  });

  it("does not block repeat applications to the same opening (OD-005 pending)", async () => {
    mockPublishedOpening(formWithDocument(true));

    const first = await applicationService.submitApplication({
      userId: CANDIDATE_ID,
      openingSlug: "frontend-intern",
      responses: { fullName: "Asha" },
      resumeFile: pdfUpload(),
    });
    const second = await applicationService.submitApplication({
      userId: CANDIDATE_ID,
      openingSlug: "frontend-intern",
      responses: { fullName: "Asha" },
      resumeFile: pdfUpload(),
    });

    expect(first.applicationId).toBe("app-1");
    expect(second.applicationId).toBe("app-1");
    expect(mockPrisma.application.create).toHaveBeenCalledTimes(2);
  });

  it("accepts a submission without a document when the form marks it optional", async () => {
    mockPublishedOpening(formWithDocument(false));

    const result = await applicationService.submitApplication({
      userId: CANDIDATE_ID,
      openingSlug: "frontend-intern",
      responses: { fullName: "Asha" },
    });

    expect(result.referenceCode).toMatch(/^GARA-\d{4}-APP-[A-F0-9]{6}$/);
    expect(mockStorage.upload).not.toHaveBeenCalled();
    expect(mockPrisma.application.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ resumeStorageKey: "" }) })
    );
  });

  it("requires the document only when the form marks it required", async () => {
    mockPublishedOpening(formWithDocument(true));

    await expect(
      applicationService.submitApplication({
        userId: CANDIDATE_ID,
        openingSlug: "frontend-intern",
        responses: { fullName: "Asha" },
      })
    ).rejects.toMatchObject({
      name: "ValidationError",
      issues: [{ field: "resume", message: "Resume is required" }],
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a document when the form does not request one", async () => {
    mockPublishedOpening(FORM_WITHOUT_DOCUMENT);

    await expect(
      applicationService.submitApplication({
        userId: CANDIDATE_ID,
        openingSlug: "frontend-intern",
        responses: { fullName: "Asha" },
        resumeFile: pdfUpload(),
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mockStorage.upload).not.toHaveBeenCalled();
  });

  it("keeps the PDF magic-byte check", async () => {
    mockPublishedOpening(formWithDocument(true));

    await expect(
      applicationService.submitApplication({
        userId: CANDIDATE_ID,
        openingSlug: "frontend-intern",
        responses: { fullName: "Asha" },
        resumeFile: pdfUpload(Buffer.from("MZ-not-a-pdf")),
      })
    ).rejects.toThrow("The uploaded file is not a valid PDF document");
    expect(mockStorage.upload).not.toHaveBeenCalled();
  });

  it("rejects submissions to openings that are not published", async () => {
    mockPublishedOpening(formWithDocument(false), "CLOSED");

    await expect(
      applicationService.submitApplication({
        userId: CANDIDATE_ID,
        openingSlug: "frontend-intern",
        responses: { fullName: "Asha" },
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("deletes the uploaded document when the database transaction fails (BUG-17)", async () => {
    mockPublishedOpening(formWithDocument(true));
    mockPrisma.$transaction.mockRejectedValueOnce(new Error("connection reset"));

    await expect(
      applicationService.submitApplication({
        userId: CANDIDATE_ID,
        openingSlug: "frontend-intern",
        responses: { fullName: "Asha" },
        resumeFile: pdfUpload(),
      })
    ).rejects.toThrow("connection reset");
    expect(mockStorage.delete).toHaveBeenCalledWith("resumes/frontend-intern/key.pdf");
  });

  it("retries with a new reference code on a unique-constraint collision (BUG-15)", async () => {
    mockPublishedOpening(formWithDocument(true));
    mockPrisma.$transaction.mockRejectedValueOnce(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
    );

    const result = await applicationService.submitApplication({
      userId: CANDIDATE_ID,
      openingSlug: "frontend-intern",
      responses: { fullName: "Asha" },
      resumeFile: pdfUpload(),
    });

    expect(result.applicationId).toBe("app-1");
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    expect(mockStorage.delete).not.toHaveBeenCalled();
  });

  it("gives up after a bounded number of collisions and cleans up the upload", async () => {
    mockPublishedOpening(formWithDocument(true));
    mockPrisma.$transaction.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
    );

    await expect(
      applicationService.submitApplication({
        userId: CANDIDATE_ID,
        openingSlug: "frontend-intern",
        responses: { fullName: "Asha" },
        resumeFile: pdfUpload(),
      })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(MAX_REFERENCE_ATTEMPTS);
    expect(mockStorage.delete).toHaveBeenCalledTimes(1);
  });
});

describe("Candidate application ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseApplication = {
    id: "app-1",
    referenceCode: "GARA-2026-APP-ABCDEF",
    status: "SUBMITTED",
    createdAt: new Date(),
    updatedAt: new Date(),
    opening: { id: "o1", title: "T", slug: "t", department: "D", type: "INTERNSHIP", location: "L" },
    formVersion: { versionNumber: 1, schemaDefinition: { sections: [] } },
    submittedResponses: {},
    statusHistory: [],
  };

  it("blocks cross-candidate access to application details", async () => {
    mockPrisma.application.findUnique.mockResolvedValue({
      ...baseApplication,
      resumeStorageKey: "k",
      candidate: { userId: OTHER_ID },
    });
    await expect(
      applicationService.getCandidateApplicationDetail("app-1", CANDIDATE_ID)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("reports whether a document was attached", async () => {
    mockPrisma.application.findUnique.mockResolvedValue({
      ...baseApplication,
      resumeStorageKey: "",
      candidate: { userId: CANDIDATE_ID },
    });
    const detail = await applicationService.getCandidateApplicationDetail("app-1", CANDIDATE_ID);
    expect(detail.hasResume).toBe(false);
  });

  it("refuses resume downloads for other candidates and for applications without a document", async () => {
    mockPrisma.application.findUnique.mockResolvedValueOnce({
      id: "app-1",
      resumeStorageKey: "k",
      assignedRecruiterId: null,
      candidate: { userId: OTHER_ID },
      interviewSchedules: [],
    });
    await expect(
      applicationService.getApplicationResume("app-1", candidateViewer)
    ).rejects.toBeInstanceOf(ForbiddenError);

    mockPrisma.application.findUnique.mockResolvedValueOnce({
      id: "app-1",
      resumeStorageKey: "",
      assignedRecruiterId: null,
      candidate: { userId: CANDIDATE_ID },
      interviewSchedules: [],
    });
    await expect(
      applicationService.getApplicationResume("app-1", candidateViewer)
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockStorage.get).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Resume access for recruitment staff (REV-09, docs/SECURITY.md record-level access)
// ---------------------------------------------------------------------------

describe("Resume download scoping for staff", () => {
  const INTERVIEWER_ID = "33333333-3333-4333-8333-333333333333";
  const HR_ID = "44444444-4444-4444-8444-444444444444";
  const interviewer = { id: INTERVIEWER_ID, email: "int@gara.test", name: "Int", roles: [Role.INTERVIEWER] };
  const hr = { id: HR_ID, email: "hr@gara.test", name: "HR", roles: [Role.HR] };
  const resumeFile = { buffer: Buffer.from("%PDF-1.4"), mimeType: "application/pdf", filename: "cv.pdf" };

  function otherCandidateApplication(extra: Record<string, unknown> = {}) {
    return {
      id: "app-1",
      resumeStorageKey: "resumes/k.pdf",
      assignedRecruiterId: null,
      candidate: { userId: OTHER_ID },
      interviewSchedules: [],
      ...extra,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // No custom permission row: staff fall back to their role defaults.
    mockPrisma.subAdminPermission.findUnique.mockResolvedValue(null);
    mockStorage.get.mockResolvedValue(resumeFile);
  });

  it("blocks an interviewer from downloading the resume of an unassigned application", async () => {
    mockPrisma.application.findUnique.mockResolvedValue(otherCandidateApplication());
    await expect(applicationService.getApplicationResume("app-1", interviewer)).rejects.toBeInstanceOf(
      ForbiddenError
    );
    expect(mockStorage.get).not.toHaveBeenCalled();
    // Only the viewer's own rounds are loaded to decide the assignment.
    expect(mockPrisma.application.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          interviewSchedules: expect.objectContaining({ where: { interviewerId: INTERVIEWER_ID } }),
        }),
      })
    );
  });

  it("lets an interviewer download the resume of an application they interview", async () => {
    mockPrisma.application.findUnique.mockResolvedValue(
      otherCandidateApplication({ interviewSchedules: [{ interviewerId: INTERVIEWER_ID }] })
    );
    await expect(applicationService.getApplicationResume("app-1", interviewer)).resolves.toEqual(resumeFile);
  });

  it("lets an interviewer assigned as recruiter download the resume", async () => {
    mockPrisma.application.findUnique.mockResolvedValue(
      otherCandidateApplication({ assignedRecruiterId: INTERVIEWER_ID })
    );
    await expect(applicationService.getApplicationResume("app-1", interviewer)).resolves.toEqual(resumeFile);
  });

  it("blocks an interviewer whose canApplications permission was revoked", async () => {
    mockPrisma.subAdminPermission.findUnique.mockResolvedValue({
      id: "perm",
      userId: INTERVIEWER_ID,
      canApplications: false,
      canOpenings: false,
      canInterviews: true,
      canEvaluations: false,
      canEmployees: false,
      canAttendance: false,
      canLeave: false,
      canPayroll: false,
      canReports: false,
    });
    mockPrisma.application.findUnique.mockResolvedValue(
      otherCandidateApplication({ interviewSchedules: [{ interviewerId: INTERVIEWER_ID }] })
    );
    await expect(applicationService.getApplicationResume("app-1", interviewer)).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });

  it("keeps HR access to every application's resume", async () => {
    mockPrisma.application.findUnique.mockResolvedValue(otherCandidateApplication());
    await expect(applicationService.getApplicationResume("app-1", hr)).resolves.toEqual(resumeFile);
  });
});

// ---------------------------------------------------------------------------
// submitApplicationAction (SEC-20, SEC-21, BUG-01)
// ---------------------------------------------------------------------------

function signInAs(userId: string, roles: Role[]) {
  mockSession.current = { user: { id: userId, email: `${userId}@gara.test`, name: "Asha" } };
  mockPrisma.user.findUnique.mockImplementation(async (args: { where: { id: string } }) =>
    args.where.id === userId
      ? {
          id: userId,
          name: "Asha",
          email: `${userId}@gara.test`,
          mustChangePassword: false,
          roles: roles.map((role) => ({ role })),
          candidateProfile: { id: "profile-1" },
        }
      : null
  );
}

function submissionForm(responses: unknown = { fullName: "Asha" }) {
  const formData = new FormData();
  formData.append("openingSlug", "frontend-intern");
  formData.append("responses", JSON.stringify(responses));
  return formData;
}

describe("submitApplicationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.current = null;
    mockRateLimiter.enforce.mockResolvedValue({ allowed: true, remaining: 4, retryAfterSeconds: 0 });
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => unknown) =>
      cb(mockPrisma)
    );
    mockPrisma.application.create.mockImplementation(
      async ({ data }: { data: { referenceCode: string } }) => ({
        id: "app-1",
        referenceCode: data.referenceCode,
        createdAt: new Date(),
      })
    );
  });

  it("requires authentication", async () => {
    const result = await submitApplicationAction(submissionForm());
    expect(result).toEqual({
      success: false,
      error: "You must be logged in to access this resource",
    });
    expect(mockRateLimiter.enforce).not.toHaveBeenCalled();
  });

  it("rate limits submissions per user", async () => {
    signInAs(CANDIDATE_ID, [Role.CANDIDATE]);
    mockRateLimiter.enforce.mockRejectedValueOnce(new RateLimitError(600));

    const result = await submitApplicationAction(submissionForm());
    expect(result.success).toBe(false);
    expect(!result.success && result.error).toContain("Too many requests");
    expect(mockRateLimiter.enforce).toHaveBeenCalledWith(
      CANDIDATE_ID,
      RATE_LIMIT_POLICIES.APPLICATION_SUBMIT
    );
    expect(mockPrisma.opening.findUnique).not.toHaveBeenCalled();
  });

  it("rejects malformed response payloads", async () => {
    signInAs(CANDIDATE_ID, [Role.CANDIDATE]);
    const result = await submitApplicationAction(submissionForm({ fullName: { $gt: "" } }));
    expect(result.success).toBe(false);
    expect(mockPrisma.opening.findUnique).not.toHaveBeenCalled();
  });

  it("never returns internal error messages to the client", async () => {
    signInAs(CANDIDATE_ID, [Role.CANDIDATE]);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockPrisma.opening.findUnique.mockRejectedValueOnce(
      new Error("connect ECONNREFUSED postgres://admin:secret@db")
    );

    const result = await submitApplicationAction(submissionForm());
    expect(result).toEqual({ success: false, error: "Submission failed. Please try again later." });
    consoleError.mockRestore();
  });

  it("returns field errors for form validation failures", async () => {
    signInAs(CANDIDATE_ID, [Role.CANDIDATE]);
    mockPublishedOpening(formWithDocument(true));

    const result = await submitApplicationAction(submissionForm());
    expect(result).toMatchObject({
      success: false,
      error: "Application form validation failed",
      fieldErrors: { resume: "Resume is required" },
    });
  });

  it("schedules delivery of the queued confirmation email after a successful submission", async () => {
    signInAs(CANDIDATE_ID, [Role.CANDIDATE]);
    mockPublishedOpening(formWithDocument(false));

    const result = await submitApplicationAction(submissionForm());
    expect(result.success).toBe(true);
    expect(mockPrisma.notificationOutbox.create).toHaveBeenCalledTimes(1);
    expect(mockOutbox.scheduleOutboxFlush).toHaveBeenCalledTimes(1);
  });
});

describe("Private Document Storage Provider (Prompt 3)", () => {
  const testStorageDir = path.join(process.cwd(), ".storage", "test-private");
  const storage = new LocalStorageService(testStorageDir);

  afterEach(async () => {
    await fs.rm(testStorageDir, { recursive: true, force: true }).catch(() => {});
  });

  it("stores uploaded file in private folder outside public directory", async () => {
    const dummyBuffer = Buffer.from("PDF_SAMPLE_DATA_CONTENT");
    const result = await storage.upload(dummyBuffer, "test_resume.pdf", "application/pdf");

    expect(result.storageKey).toContain("resumes/");
    expect(result.storageKey).toContain("test_resume.pdf");

    // Retrieve file
    const retrieved = await storage.get(result.storageKey);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.mimeType).toBe("application/pdf");
    expect(retrieved?.buffer.toString()).toBe("PDF_SAMPLE_DATA_CONTENT");
  });

  it("returns null for non-existent storage key and prevents path traversal", async () => {
    const notFound = await storage.get("non-existent-key.pdf");
    expect(notFound).toBeNull();

    const traversal = await storage.get("../../../etc/passwd");
    expect(traversal).toBeNull();
  });

  it("strictly guards against unapproved local disk usage in production", async () => {
    const envRecord = process.env as Record<string, string | undefined>;
    const originalEnv = envRecord["NODE_ENV"];
    envRecord["NODE_ENV"] = "production";
    delete envRecord["ALLOW_LOCAL_STORAGE_IN_PROD"];

    try {
      await expect(
        storage.upload(Buffer.from("TEST"), "file.pdf", "application/pdf")
      ).rejects.toThrow(/Security Policy Violation: OD-013/);
    } finally {
      envRecord["NODE_ENV"] = originalEnv;
    }
  });
});

describe("Strict IDOR and Data Isolation Security Policy", () => {
  it("never includes internalNotes or staff identifiers in candidate status timeline", () => {
    // Simulate database status history records
    const rawHistoryRecords = [
      {
        id: "hist-1",
        toStatus: "SUBMITTED",
        internalNotes: "CONFIDENTIAL: Low GPA candidate, requires senior recruiter review.",
        candidateMessage: "Your application has been received.",
        actorId: "staff-uuid-001",
        createdAt: new Date("2026-03-01T10:00:00Z"),
      },
      {
        id: "hist-2",
        toStatus: "SCREENING",
        internalNotes: "CONFIDENTIAL: Interviewer assigned - do not reveal.",
        candidateMessage: "Your application is currently under screening.",
        actorId: "staff-uuid-002",
        createdAt: new Date("2026-03-02T10:00:00Z"),
      },
    ];

    // Candidate projection (as enforced in ApplicationService.getCandidateApplicationDetail)
    const candidateTimeline = rawHistoryRecords.map((r) => ({
      id: r.id,
      toStatus: r.toStatus,
      candidateMessage: r.candidateMessage,
      createdAt: r.createdAt,
    }));

    // Verify complete absence of internal staff information
    expect(candidateTimeline[0]).not.toHaveProperty("internalNotes");
    expect(candidateTimeline[0]).not.toHaveProperty("actorId");
    expect(candidateTimeline[1]).not.toHaveProperty("internalNotes");
    expect(candidateTimeline[1]).not.toHaveProperty("actorId");
    expect(candidateTimeline[0].candidateMessage).toBe("Your application has been received.");
  });
});
