import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { escapeCsvCell, MAX_EXPORT_ROWS } from "@/features/reports/services/report-service";
import { businessDateKey } from "@/lib/time/business-time";

/*
 * Administrator CSV exports of the careers portal sections (Phase 6): enrollments, payments,
 * refunds, certificates, ambassadors, payouts and print orders. Every export is capped,
 * audited and escaped against spreadsheet formula injection. Secrets (UPI IDs, signatures)
 * are never exported; UPI IDs only masked.
 */

type Cell = string | number | null | undefined;
interface Dataset {
  headers: string[];
  rows: () => Promise<Cell[][]>;
}

const rupees = (paise: number | null | undefined) => (paise === null || paise === undefined ? "" : (paise / 100).toFixed(2));
const iso = (date: Date | null | undefined) => (date ? date.toISOString() : "");
const take = MAX_EXPORT_ROWS + 1;

const DATASETS: Record<string, Dataset> = {
  "training-enrollments": {
    headers: ["Receipt", "Student", "Email", "Programme", "Batch", "Status", "List price (INR)", "Discount (INR)", "Paid (INR)", "Referral code", "Free re-attempt", "Paid at", "Result at"],
    rows: async () =>
      (
        await prisma.trainingEnrollment.findMany({
          where: { status: { not: "PENDING_PAYMENT" } },
          orderBy: { createdAt: "desc" },
          take,
          select: {
            receiptNo: true,
            status: true,
            listPricePaise: true,
            discountPaise: true,
            amountPaidPaise: true,
            referralCode: true,
            reattemptOfId: true,
            paidAt: true,
            resultAt: true,
            user: { select: { name: true, email: true } },
            batch: { select: { name: true, program: { select: { title: true } } } },
          },
        })
      ).map((row) => [
        row.receiptNo,
        row.user.name,
        row.user.email,
        row.batch.program.title,
        row.batch.name,
        row.status,
        rupees(row.listPricePaise),
        rupees(row.discountPaise),
        rupees(row.amountPaidPaise),
        row.referralCode,
        row.reattemptOfId ? "yes" : "no",
        iso(row.paidAt),
        iso(row.resultAt),
      ]),
  },
  "training-payments": {
    headers: ["Created at", "Razorpay order", "Razorpay payment", "Amount (INR)", "Status", "Captured at", "Receipt", "Student email"],
    rows: async () =>
      (
        await prisma.trainingPayment.findMany({
          orderBy: { createdAt: "desc" },
          take,
          select: {
            createdAt: true,
            razorpayOrderId: true,
            razorpayPaymentId: true,
            amountPaise: true,
            status: true,
            capturedAt: true,
            enrollment: { select: { receiptNo: true, user: { select: { email: true } } } },
          },
        })
      ).map((row) => [iso(row.createdAt), row.razorpayOrderId, row.razorpayPaymentId, rupees(row.amountPaise), row.status, iso(row.capturedAt), row.enrollment.receiptNo, row.enrollment.user.email]),
  },
  "training-refunds": {
    headers: ["Requested at", "Student", "Email", "Programme", "Batch", "Amount (INR)", "Status", "Decided at", "Razorpay refund", "Reason", "Decision note"],
    rows: async () =>
      (
        await prisma.trainingRefund.findMany({
          orderBy: { requestedAt: "desc" },
          take,
          select: {
            requestedAt: true,
            amountPaise: true,
            status: true,
            decidedAt: true,
            razorpayRefundId: true,
            reason: true,
            decisionNote: true,
            enrollment: { select: { user: { select: { name: true, email: true } }, batch: { select: { name: true, program: { select: { title: true } } } } } },
          },
        })
      ).map((row) => [
        iso(row.requestedAt),
        row.enrollment.user.name,
        row.enrollment.user.email,
        row.enrollment.batch.program.title,
        row.enrollment.batch.name,
        rupees(row.amountPaise),
        row.status,
        iso(row.decidedAt),
        row.razorpayRefundId,
        row.reason,
        row.decisionNote,
      ]),
  },
  certificates: {
    headers: ["Certificate ID", "Type", "Recipient", "Programme", "College", "Issue date", "Completion date", "Status", "Version"],
    rows: async () =>
      (
        await prisma.certificate.findMany({
          orderBy: { issueDate: "desc" },
          take,
          select: { verificationCode: true, type: true, recipientName: true, programmeTitle: true, collegeName: true, issueDate: true, completionDate: true, status: true, versionNumber: true },
        })
      ).map((row) => [row.verificationCode, row.type, row.recipientName, row.programmeTitle, row.collegeName, businessDateKey(row.issueDate), row.completionDate.toISOString().slice(0, 10), row.status, row.versionNumber]),
  },
  ambassadors: {
    headers: ["Name", "Email", "Phone", "College", "Status", "Role", "Referral code", "Applied at", "Approved at", "UPI (masked)", "Flag"],
    rows: async () =>
      (
        await prisma.campusAmbassador.findMany({
          orderBy: { createdAt: "desc" },
          take,
          select: {
            phone: true,
            status: true,
            role: true,
            referralCode: true,
            createdAt: true,
            approvedAt: true,
            upiIdMasked: true,
            duplicateFlag: true,
            user: { select: { name: true, email: true } },
            college: { select: { name: true } },
          },
        })
      ).map((row) => [row.user.name, row.user.email, row.phone, row.college?.name, row.status, row.role, row.referralCode, iso(row.createdAt), iso(row.approvedAt), row.upiIdMasked, row.duplicateFlag]),
  },
  "ambassador-payouts": {
    headers: ["Created at", "Ambassador", "Email", "Gross (INR)", "TDS (INR)", "Net (INR)", "Method", "Status", "UTR", "Paid at", "Failure"],
    rows: async () =>
      (
        await prisma.ambassadorPayout.findMany({
          orderBy: { createdAt: "desc" },
          take,
          select: {
            createdAt: true,
            grossPaise: true,
            tdsPaise: true,
            netPaise: true,
            method: true,
            status: true,
            utr: true,
            paidAt: true,
            failureReason: true,
            ambassador: { select: { user: { select: { name: true, email: true } } } },
          },
        })
      ).map((row) => [iso(row.createdAt), row.ambassador.user.name, row.ambassador.user.email, rupees(row.grossPaise), rupees(row.tdsPaise), rupees(row.netPaise), row.method, row.status, row.utr, iso(row.paidAt), row.failureReason]),
  },
  "print-orders": {
    headers: ["Paid at", "Certificate ID", "Recipient", "Phone", "Delivery", "Zone", "Address", "City", "State", "PIN", "College", "Expected delivery", "Status", "Courier", "Tracking", "Amount (INR)", "Receipt"],
    rows: async () =>
      (
        await prisma.certificatePrintOrder.findMany({
          where: { status: { not: "PENDING_PAYMENT" } },
          orderBy: { paidAt: "desc" },
          take,
          select: {
            paidAt: true,
            recipientName: true,
            phone: true,
            deliveryType: true,
            deliveryZone: true,
            expectedDelivery: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            state: true,
            pincode: true,
            collegeName: true,
            status: true,
            courierName: true,
            trackingNo: true,
            amountPaise: true,
            receiptNo: true,
            certificate: { select: { verificationCode: true } },
          },
        })
      ).map((row) => [
        iso(row.paidAt),
        row.certificate.verificationCode,
        row.recipientName,
        row.phone,
        row.deliveryType,
        row.deliveryZone,
        [row.addressLine1, row.addressLine2].filter(Boolean).join(", "),
        row.city,
        row.state,
        row.pincode,
        row.collegeName,
        row.expectedDelivery,
        row.status,
        row.courierName,
        row.trackingNo,
        rupees(row.amountPaise),
        row.receiptNo,
      ]),
  },
};

export const ADMIN_EXPORT_DATASETS = Object.keys(DATASETS);

/** Builds one CSV (UTF-8 with BOM for spreadsheets) and audits the export. */
export async function exportAdminDataset(user: AuthenticatedUser, dataset: string, now: Date) {
  if (!user.roles.includes(Role.ADMIN)) throw new ForbiddenError("Only administrators can export this data.");
  const definition = DATASETS[dataset];
  if (!definition) throw new NotFoundError("Unknown export");
  const all = await definition.rows();
  const truncated = all.length > MAX_EXPORT_ROWS;
  const rows = truncated ? all.slice(0, MAX_EXPORT_ROWS) : all;
  const csv = `﻿${[definition.headers, ...rows].map((row) => row.map((cell) => escapeCsvCell(cell ?? "")).join(",")).join("\r\n")}\r\n`;
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      actorRole: Role.ADMIN,
      action: "EXPORT_REPORT",
      resourceType: "Report",
      resourceId: dataset,
      diffPayload: { dataset, rowCount: rows.length, truncated },
    },
  });
  return { csv, filename: `gara-${dataset}-${businessDateKey(now)}.csv`, truncated };
}
