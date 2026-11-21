import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth/guards";

// ---------------------------------------------------------------------------
// Admin certificate directory and print-order counts.
// ---------------------------------------------------------------------------

const { db } = vi.hoisted(() => ({
  db: {
    certificate: { findMany: vi.fn(), groupBy: vi.fn() },
    certificatePrintOrder: { count: vi.fn(), groupBy: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));

import { listCertificatesForStaff, STAFF_CERTIFICATES_LIMIT } from "@/features/certificates/services/certificate-directory";
import { countPrintOrdersByStatus } from "@/features/print-orders/services/print-order-service";
import { ForbiddenError } from "@/lib/errors";

const admin = { id: "a1", roles: [Role.ADMIN] } as unknown as AuthenticatedUser;
const hr = { id: "h1", roles: [Role.HR] } as unknown as AuthenticatedUser;

beforeEach(() => {
  vi.clearAllMocks();
  db.certificate.findMany.mockResolvedValue([]);
  db.certificate.groupBy.mockResolvedValue([]);
  db.certificatePrintOrder.count.mockResolvedValue(0);
});

describe("listCertificatesForStaff", () => {
  it("is for administrators only", async () => {
    await expect(listCertificatesForStaff(hr, { type: null, status: null, query: "" })).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.certificate.findMany).not.toHaveBeenCalled();
  });

  it("filters by type, status and a name, programme or code search, bounded", async () => {
    await listCertificatesForStaff(admin, { type: "TRAINING_COMPLETION", status: "ACTIVE", query: " gara-it " });
    const args = db.certificate.findMany.mock.calls[0][0];
    expect(args.take).toBe(STAFF_CERTIFICATES_LIMIT);
    expect(args.where).toMatchObject({ type: "TRAINING_COMPLETION", status: "ACTIVE" });
    expect(args.where.OR).toEqual([
      { recipientName: { contains: "gara-it", mode: "insensitive" } },
      { programmeTitle: { contains: "gara-it", mode: "insensitive" } },
      { verificationCode: { contains: "GARA-IT" } },
    ]);
    // Only paid print orders count; unpaid checkouts are not orders.
    expect(args.select.printOrders.where).toEqual({ status: { not: "PENDING_PAYMENT" } });
  });

  it("links each certificate to the record it was issued from and shows its print state", async () => {
    db.certificate.findMany.mockResolvedValue([
      { id: "c1", verificationCode: "GARA-IN-1", type: "INTERNSHIP_COMPLETION", status: "ACTIVE", recipientName: "A", programmeTitle: "P", issueDate: new Date(), versionNumber: 1, revocationReason: null, enrollmentId: "e1", trainingEnrollment: null, issuedBy: { name: "HR" }, printOrders: [] },
      { id: "c2", verificationCode: "GARA-IT-2", type: "TRAINING_COMPLETION", status: "ACTIVE", recipientName: "B", programmeTitle: "P", issueDate: new Date(), versionNumber: 1, revocationReason: null, enrollmentId: null, trainingEnrollment: { batchId: "b1" }, issuedBy: null, printOrders: [{ status: "SHIPPED" }] },
      { id: "c3", verificationCode: "GARA-CA-3", type: "CAMPUS_AMBASSADOR", status: "REVOKED", recipientName: "C", programmeTitle: "P", issueDate: new Date(), versionNumber: 2, revocationReason: "Abuse", enrollmentId: null, trainingEnrollment: null, issuedBy: null, printOrders: [] },
    ]);
    db.certificate.groupBy
      .mockResolvedValueOnce([
        { type: "INTERNSHIP_COMPLETION", _count: { _all: 1 } },
        { type: "TRAINING_COMPLETION", _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { status: "ACTIVE", _count: { _all: 2 } },
        { status: "REVOKED", _count: { _all: 1 } },
      ]);
    db.certificatePrintOrder.count.mockResolvedValue(1);
    const result = await listCertificatesForStaff(admin, { type: null, status: null, query: "" });
    expect(result.certificates.map((row) => row.sourceHref)).toEqual([
      "/admin/evaluations/e1",
      "/admin/training/batches/b1?tab=students",
      "/admin/campus-ambassadors",
    ]);
    expect(result.certificates[1].printStatus).toBe("SHIPPED");
    expect(result.certificates[0].issuedBy).toBe("HR");
    expect(result.totals).toEqual({
      active: 2,
      revoked: 1,
      superseded: 0,
      all: 3,
      activeInternship: 1,
      activeTraining: 1,
      activeAmbassador: 0,
      printOrders: 1,
    });
  });
});

describe("countPrintOrdersByStatus", () => {
  it("counts paid orders per status for administrators", async () => {
    db.certificatePrintOrder.groupBy.mockResolvedValue([
      { status: "PAID", _count: { _all: 2 } },
      { status: "SHIPPED", _count: { _all: 1 } },
    ]);
    await expect(countPrintOrdersByStatus(admin)).resolves.toEqual({ PAID: 2, PRINTED: 0, SHIPPED: 1, DELIVERED: 0 });
    expect(db.certificatePrintOrder.groupBy.mock.calls[0][0].where).toEqual({ status: { not: "PENDING_PAYMENT" } });
    await expect(countPrintOrdersByStatus(hr)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
