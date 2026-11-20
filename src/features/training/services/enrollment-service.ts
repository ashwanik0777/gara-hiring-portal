import { Role, TrainingPaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { COMPANY, confirmedCompanyFacts } from "@/config/site";
import { BUSINESS_TIME_ZONE } from "@/lib/time/business-time";
import { buildPaymentReceiptPdf } from "@/infrastructure/pdf/payment-receipt-pdf-generator";
import { formatInr } from "../money";
import { isBatchOpenForEnrollment, seatsTakenByBatch } from "./program-service";

/** Student Query: the signed-in user's training enrollments with what their page shows. */
export async function listMyTrainingEnrollments(userId: string) {
  return prisma.trainingEnrollment.findMany({
    // Paid enrollments and free re-attempts; abandoned checkouts are not shown.
    where: { userId, OR: [{ paidAt: { not: null } }, { reattemptOfId: { not: null } }] },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      receiptNo: true,
      amountPaidPaise: true,
      transferCount: true,
      paidAt: true,
      reattemptOfId: true,
      resultAt: true,
      certificate: { select: { id: true, verificationCode: true, status: true } },
      batch: {
        select: {
          id: true,
          name: true,
          startDate: true,
          firstClassAt: true,
          programId: true,
          program: { select: { title: true, slug: true } },
        },
      },
      refunds: { orderBy: { requestedAt: "desc" }, take: 1, select: { status: true, decisionNote: true, amountPaise: true } },
    },
  });
}

export type MyTrainingEnrollment = Awaited<ReturnType<typeof listMyTrainingEnrollments>>[number];

/** Later batches of the same programme that are open for enrollment and have a free seat. */
export async function listTransferTargets(programId: string, currentBatchId: string, now: Date) {
  const batches = await prisma.trainingBatch.findMany({
    where: { programId, id: { not: currentBatchId }, status: "UPCOMING", startDate: { gt: now } },
    orderBy: { startDate: "asc" },
    select: { id: true, name: true, startDate: true, status: true, enrollmentDeadline: true, seats: true },
  });
  const open = batches.filter((batch) => isBatchOpenForEnrollment(batch, now));
  const taken = await seatsTakenByBatch(open.map((batch) => batch.id), now);
  return open
    .map((batch) => ({ id: batch.id, name: batch.name, startDate: batch.startDate, seatsLeft: Math.max(0, batch.seats - (taken.get(batch.id) ?? 0)) }))
    .filter((batch) => batch.seatsLeft > 0);
}

export type TransferTarget = Awaited<ReturnType<typeof listTransferTargets>>[number];

/** The Payment Receipt PDF: the student's own, or any for an administrator. */
export async function getReceiptPdf(enrollmentId: string, actor: { id: string; roles: Role[] }) {
  const enrollment = await prisma.trainingEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      user: { select: { name: true, email: true } },
      batch: { select: { name: true, program: { select: { title: true } } } },
      payments: { where: { status: TrainingPaymentStatus.CAPTURED }, orderBy: { capturedAt: "asc" }, take: 1 },
    },
  });
  if (!enrollment || (enrollment.userId !== actor.id && !actor.roles.includes(Role.ADMIN))) {
    throw new NotFoundError("Receipt not found");
  }
  const payment = enrollment.payments[0];
  if (!enrollment.receiptNo || !enrollment.paidAt || !payment?.razorpayPaymentId) {
    throw new ConflictError("No payment has been received for this enrollment yet.");
  }

  const facts = confirmedCompanyFacts();
  const statutory = facts.filter((fact) => fact.label === "CIN" || fact.label === "Udyam Registration No.").map((fact) => `${fact.label}: ${fact.value}`);
  const office = facts.find((fact) => fact.label === "Registered office");
  const buffer = buildPaymentReceiptPdf({
    receiptNo: enrollment.receiptNo,
    paidAt: enrollment.paidAt,
    timeZone: BUSINESS_TIME_ZONE,
    companyName: (COMPANY.registeredName ?? COMPANY.brandName).toUpperCase(),
    companyLines: [statutory.join("  |  "), office ? `Registered office: ${office.value}` : ""].filter(Boolean),
    studentName: enrollment.user.name,
    studentEmail: enrollment.user.email,
    programTitle: enrollment.batch.program.title,
    batchName: enrollment.batch.name,
    listPrice: formatInr(enrollment.listPricePaise),
    discount: enrollment.discountPaise > 0 ? formatInr(enrollment.discountPaise) : null,
    amountPaid: formatInr(enrollment.amountPaidPaise),
    paymentReference: payment.razorpayPaymentId,
    contactEmail: COMPANY.contactEmail,
  });
  return { buffer, filename: `GARA_Payment_Receipt_${enrollment.receiptNo.replace(/[^A-Za-z0-9-]/g, "")}.pdf` };
}
