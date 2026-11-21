import { CertificateStatus, CertificateType, PrintOrderStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";

/*
 * Administrators: every issued certificate in one list (internship, Industrial Training and
 * Campus Ambassador). Certificates are issued from their own records (evaluation cockpit, batch
 * learning area, ambassadors page); this directory finds them, links back to the record, and
 * shows whether a printed copy was ordered.
 */

export const STAFF_CERTIFICATES_LIMIT = 500;

export interface CertificateDirectoryFilter {
  type: CertificateType | null;
  status: CertificateStatus | null;
  query: string;
}

/** Where the certificate was issued, so staff can revoke or reissue it there. */
function sourceHref(row: { type: CertificateType; enrollmentId: string | null; trainingEnrollment: { batchId: string } | null }): string | null {
  if (row.type === CertificateType.INTERNSHIP_COMPLETION && row.enrollmentId) return `/admin/evaluations/${row.enrollmentId}`;
  if (row.type === CertificateType.TRAINING_COMPLETION && row.trainingEnrollment) return `/admin/training/batches/${row.trainingEnrollment.batchId}?tab=students`;
  if (row.type === CertificateType.CAMPUS_AMBASSADOR) return "/admin/campus-ambassadors";
  return null;
}

export async function listCertificatesForStaff(user: AuthenticatedUser, filter: CertificateDirectoryFilter) {
  if (!user.roles.includes(Role.ADMIN)) throw new ForbiddenError("Only administrators can see every certificate.");
  const query = filter.query.trim().slice(0, 100);
  const where: Prisma.CertificateWhereInput = {
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(query
      ? {
          OR: [
            { recipientName: { contains: query, mode: "insensitive" } },
            { programmeTitle: { contains: query, mode: "insensitive" } },
            { verificationCode: { contains: query.toUpperCase() } },
          ],
        }
      : {}),
  };
  const [rows, activeByType, byStatus, printOrders] = await Promise.all([
    prisma.certificate.findMany({
      where,
      orderBy: { issueDate: "desc" },
      take: STAFF_CERTIFICATES_LIMIT,
      select: {
        id: true,
        verificationCode: true,
        type: true,
        status: true,
        recipientName: true,
        programmeTitle: true,
        issueDate: true,
        versionNumber: true,
        revocationReason: true,
        enrollmentId: true,
        trainingEnrollment: { select: { batchId: true } },
        issuedBy: { select: { name: true } },
        printOrders: {
          where: { status: { not: PrintOrderStatus.PENDING_PAYMENT } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true },
        },
      },
    }),
    prisma.certificate.groupBy({ by: ["type"], where: { status: CertificateStatus.ACTIVE }, _count: { _all: true } }),
    prisma.certificate.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.certificatePrintOrder.count({ where: { status: { not: PrintOrderStatus.PENDING_PAYMENT } } }),
  ]);

  const activeOf = (type: CertificateType) => activeByType.find((row) => row.type === type)?._count._all ?? 0;
  const statusOf = (status: CertificateStatus) => byStatus.find((row) => row.status === status)?._count._all ?? 0;

  return {
    certificates: rows.map((row) => ({
      id: row.id,
      verificationCode: row.verificationCode,
      type: row.type,
      status: row.status,
      recipientName: row.recipientName,
      programmeTitle: row.programmeTitle,
      issueDate: row.issueDate,
      versionNumber: row.versionNumber,
      revocationReason: row.revocationReason,
      issuedBy: row.issuedBy?.name ?? null,
      printStatus: row.printOrders[0]?.status ?? null,
      sourceHref: sourceHref(row),
    })),
    totals: {
      active: statusOf(CertificateStatus.ACTIVE),
      revoked: statusOf(CertificateStatus.REVOKED),
      superseded: statusOf(CertificateStatus.SUPERSEDED),
      all: byStatus.reduce((sum, row) => sum + row._count._all, 0),
      activeInternship: activeOf(CertificateType.INTERNSHIP_COMPLETION),
      activeTraining: activeOf(CertificateType.TRAINING_COMPLETION),
      activeAmbassador: activeOf(CertificateType.CAMPUS_AMBASSADOR),
      printOrders,
    },
  };
}

export type CertificateDirectory = Awaited<ReturnType<typeof listCertificatesForStaff>>;
export type CertificateDirectoryRow = CertificateDirectory["certificates"][number];
