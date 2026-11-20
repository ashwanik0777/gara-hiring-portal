import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma, mockAccess } = vi.hoisted(() => ({
  mockPrisma: {
    application: { findUnique: vi.fn() },
    internshipOffer: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  mockAccess: {
    assertEvaluationAccess: vi.fn(),
    assertEvaluationDecisionAuthority: vi.fn(),
    assertEnrollmentInScope: vi.fn(),
    primaryActorRole: vi.fn(() => "HR"),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/features/internship-evaluation/services/enrollment-access", () => mockAccess);

import { Role } from "@prisma/client";
import {
  INTERNSHIP_NO_FEE_STATEMENT,
  getInternshipOfferForCandidate,
  getInternshipOfferPdf,
  internshipOfferFilename,
  saveInternshipOffer,
} from "@/features/internship-offers/services/internship-offer-service";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { AuthenticatedUser } from "@/lib/auth/guards";

const HR: AuthenticatedUser = { id: "hr-1", email: "hr@example.test", name: "HR", roles: [Role.HR] };
const APPLICATION_ID = "11111111-1111-4111-8111-111111111111";
const CANDIDATE_USER = "candidate-1";

function application(overrides: Record<string, unknown> = {}) {
  return {
    id: APPLICATION_ID,
    referenceCode: "GARA-2026-APP-ABC123",
    status: "EVALUATION_SELECTED",
    opening: { type: "INTERNSHIP", title: "Frontend Intern", location: "Remote" },
    candidate: { userId: CANDIDATE_USER, user: { name: "Asha Rao" } },
    enrollment: { status: "PASSED", userId: CANDIDATE_USER, supervisorId: "mentor-1" },
    internshipOffer: null,
    ...overrides,
  };
}

const offerRecord = {
  id: "offer-1",
  applicationId: APPLICATION_ID,
  designation: "Frontend Intern",
  department: "Engineering",
  startDate: new Date("2026-12-01T00:00:00Z"),
  tenureText: "3 months, extendable",
  stipendText: null,
  signatoryName: "Director Name",
  signatoryTitle: "Director",
  version: 1,
  issuedAt: new Date("2026-11-20T00:00:00Z"),
  updatedAt: new Date("2026-11-20T00:00:00Z"),
};

const validInput = {
  applicationId: APPLICATION_ID,
  designation: "Frontend Intern",
  department: "Engineering",
  startDate: "2026-12-01",
  tenureText: "3 months, extendable",
  stipendText: "",
  signatoryName: "Director Name",
  signatoryTitle: "Director",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (cb: (client: typeof mockPrisma) => unknown) => cb(mockPrisma));
  mockAccess.assertEvaluationDecisionAuthority.mockResolvedValue({ scope: "ALL" });
  mockAccess.assertEvaluationAccess.mockResolvedValue({ scope: "ALL" });
  mockAccess.assertEnrollmentInScope.mockReturnValue(undefined);
  mockPrisma.internshipOffer.create.mockResolvedValue(offerRecord);
});

describe("saveInternshipOffer", () => {
  it("issues version 1 for a passed internship evaluation and audits it", async () => {
    mockPrisma.application.findUnique.mockResolvedValue(application());
    mockPrisma.internshipOffer.findUnique.mockResolvedValue(null);

    const offer = await saveInternshipOffer(HR, validInput);

    expect(offer.version).toBe(1);
    expect(mockPrisma.internshipOffer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          applicationId: APPLICATION_ID,
          startDate: new Date("2026-12-01T00:00:00Z"),
          stipendText: null,
          issuedById: HR.id,
        }),
      })
    );
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe("INTERNSHIP_OFFER_ISSUED");
  });

  it("raises the version when the letter is updated", async () => {
    mockPrisma.application.findUnique.mockResolvedValue(application({ internshipOffer: offerRecord }));
    mockPrisma.internshipOffer.findUnique.mockResolvedValue({ version: 1 });
    mockPrisma.internshipOffer.update.mockResolvedValue({ ...offerRecord, version: 2 });

    const offer = await saveInternshipOffer(HR, { ...validInput, tenureText: "6 months" });

    expect(offer.version).toBe(2);
    expect(mockPrisma.internshipOffer.update.mock.calls[0][0].data).toMatchObject({ version: 2, tenureText: "6 months" });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe("INTERNSHIP_OFFER_UPDATED");
  });

  it("is only for internships whose evaluation passed and that have not moved on", async () => {
    mockPrisma.application.findUnique.mockResolvedValueOnce(
      application({ opening: { type: "FULL_TIME", title: "Engineer", location: null } })
    );
    await expect(saveInternshipOffer(HR, validInput)).rejects.toBeInstanceOf(ValidationError);

    mockPrisma.application.findUnique.mockResolvedValueOnce(
      application({ enrollment: { status: "IN_PROGRESS", userId: CANDIDATE_USER, supervisorId: null } })
    );
    await expect(saveInternshipOffer(HR, validInput)).rejects.toThrow(/evaluation has PASSED/);

    mockPrisma.application.findUnique.mockResolvedValueOnce(application({ status: "HIRED" }));
    await expect(saveInternshipOffer(HR, validInput)).rejects.toBeInstanceOf(ConflictError);

    expect(mockPrisma.internshipOffer.create).not.toHaveBeenCalled();
  });

  it("needs evaluation decision authority (ADMIN/HR) and valid details", async () => {
    mockAccess.assertEvaluationDecisionAuthority.mockRejectedValueOnce(new ForbiddenError("no"));
    await expect(saveInternshipOffer(HR, validInput)).rejects.toBeInstanceOf(ForbiddenError);

    await expect(saveInternshipOffer(HR, { ...validInput, startDate: "2026-02-31" })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveInternshipOffer(HR, { ...validInput, tenureText: "x" })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveInternshipOffer(HR, { ...validInput, designation: "Role\u0000x" })).rejects.toBeInstanceOf(ValidationError);
    expect(mockPrisma.application.findUnique).not.toHaveBeenCalled();
  });
});

describe("internship offer letter PDF", () => {
  it("lets the candidate download their own letter, stating that the internship is free", async () => {
    mockPrisma.application.findUnique.mockResolvedValue(application({ internshipOffer: offerRecord }));

    const { buffer, filename } = await getInternshipOfferPdf(APPLICATION_ID, { id: CANDIDATE_USER, roles: [Role.CANDIDATE] });
    const pdf = buffer.toString("latin1");

    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(filename).toBe("GARA_Internship_Offer_GARA-2026-APP-ABC123.pdf");
    for (const text of ["Internship offer letter", "No fee", "Asha Rao", "Frontend Intern", "3 months, extendable", "Director Name"]) {
      expect(pdf).toContain(text);
    }
    // Unconfirmed company details are never printed as placeholders.
    expect(pdf).not.toMatch(/TODO|CIN:/);
    expect(mockAccess.assertEvaluationAccess).not.toHaveBeenCalled();
  });

  it("requires evaluation access in scope for anyone else", async () => {
    mockPrisma.application.findUnique.mockResolvedValue(application({ internshipOffer: offerRecord }));
    mockAccess.assertEvaluationAccess.mockRejectedValueOnce(new ForbiddenError("no access"));

    await expect(getInternshipOfferPdf(APPLICATION_ID, { id: "someone-else", roles: [Role.CANDIDATE] })).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });

  it("reports a missing letter as not found", async () => {
    mockPrisma.application.findUnique.mockResolvedValue(application());
    await expect(getInternshipOfferPdf(APPLICATION_ID, { id: CANDIDATE_USER, roles: [Role.CANDIDATE] })).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it("keeps the fixed wording and a safe file name", () => {
    expect(INTERNSHIP_NO_FEE_STATEMENT).toContain("No fee, deposit, registration charge or certificate fee");
    expect(internshipOfferFilename('GARA-2026-APP-AB"C1')).toBe("GARA_Internship_Offer_GARA-2026-APP-ABC1.pdf");
  });
});

describe("candidate view", () => {
  it("returns only the letter of the candidate's own application", async () => {
    mockPrisma.internshipOffer.findFirst.mockResolvedValue(null);
    await getInternshipOfferForCandidate(APPLICATION_ID, CANDIDATE_USER);
    expect(mockPrisma.internshipOffer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { applicationId: APPLICATION_ID, application: { candidate: { userId: CANDIDATE_USER } } } })
    );
  });
});
