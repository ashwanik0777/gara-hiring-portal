import { CertificateStatus, PrintDeliveryType, PrintOrderStatus, Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";
import { COMPANY, confirmedCompanyFacts, PRINTED_CERTIFICATE } from "@/config/site";
import { BUSINESS_TIME_ZONE } from "@/lib/time/business-time";
import { queueAutomationEmailsOnce } from "@/features/automation/outbox-once";
import { normalizeIndianPhone } from "@/features/ambassadors/schemas";
import { nextReceiptNumber } from "@/features/training/services/checkout-service";
import { formatInr } from "@/features/training/money";
import {
  capturePayment,
  createOrder,
  fetchPayment,
  getRazorpayConfig,
  isValidPaymentSignature,
  PaymentsUnavailableError,
} from "@/infrastructure/payments/razorpay";
import { buildPaymentReceiptPdf } from "@/infrastructure/pdf/payment-receipt-pdf-generator";
import { PRINT_ORDER_UPDATE_TEMPLATE } from "@/infrastructure/email/templates/print-order-emails";

/*
 * Printed certificate orders (Phase 3C). A student with an active Industrial Training
 * certificate orders a printed copy, delivered through their college or by courier, and pays
 * through Razorpay. Prices come only from PRINTED_CERTIFICATE; staff move the order through
 * printed, shipped (tracking number) and delivered.
 */

export const DELIVERY_LABELS: Record<PrintDeliveryType, string> = {
  COLLEGE_BULK: "Bulk delivery through your college",
  COURIER: "Courier to your address",
};

/** Delivery options that have a price set by the product owner. */
export function printOptions() {
  return (Object.keys(PRINTED_CERTIFICATE.pricesPaise) as PrintDeliveryType[])
    .filter((type) => PRINTED_CERTIFICATE.pricesPaise[type] !== null && (PRINTED_CERTIFICATE.pricesPaise[type] ?? 0) > 0)
    .map((type) => ({
      type,
      label: DELIVERY_LABELS[type],
      pricePaise: PRINTED_CERTIFICATE.pricesPaise[type] as number,
      expectedDelivery: PRINTED_CERTIFICATE.expectedDelivery[type],
    }));
}

const text = (label: string, min: number, max: number) => z.string().trim().min(min, `Enter the ${label}`).max(max, `${label} is too long`);

export const printCheckoutSchema = z
  .object({
    certificateId: z.uuid(),
    deliveryType: z.enum(["COLLEGE_BULK", "COURIER"]),
    recipientName: text("name on the parcel", 2, 120),
    phone: z
      .string()
      .trim()
      .refine((value) => normalizeIndianPhone(value) !== null, "Enter a 10-digit Indian mobile number")
      .transform((value) => normalizeIndianPhone(value) as string),
    addressLine1: z.string().trim().max(200).optional(),
    addressLine2: z.string().trim().max(200).optional(),
    city: z.string().trim().max(80).optional(),
    state: z.string().trim().max(80).optional(),
    pincode: z.string().trim().optional(),
  })
  .refine(
    (value) =>
      value.deliveryType !== "COURIER" ||
      (Boolean(value.addressLine1 && value.addressLine1.length >= 5) && Boolean(value.city) && Boolean(value.state) && /^[1-9]\d{5}$/.test(value.pincode ?? "")),
    { path: ["addressLine1"], message: "Enter the full address with a 6-digit PIN code" }
  );

export interface PrintCheckoutSession {
  keyId: string;
  orderId: string;
  amountPaise: number;
  prefill: { name: string; email: string; contact: string };
}

/** Starts a printed copy order: validated destination, server price, Razorpay order. */
export async function startPrintCheckout(user: AuthenticatedUser, raw: unknown): Promise<PrintCheckoutSession> {
  const config = getRazorpayConfig();
  if (!config) throw new PaymentsUnavailableError();
  const parsed = printCheckoutSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid order.");
  const input = parsed.data;
  const option = printOptions().find((item) => item.type === input.deliveryType);
  if (!option) throw new ConflictError("Printed copies are not available for this delivery option yet.");

  const [account, certificate, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { name: true, email: true, emailVerified: true } }),
    prisma.certificate.findUnique({ where: { id: input.certificateId }, select: { id: true, status: true, type: true, trainingEnrollment: { select: { userId: true } } } }),
    prisma.candidateProfile.findUnique({ where: { userId: user.id }, select: { college: { select: { name: true } } } }),
  ]);
  if (!account) throw new NotFoundError("Account not found");
  if (!account.emailVerified) throw new ForbiddenError("Verify your email address before paying.");
  if (!certificate || certificate.trainingEnrollment?.userId !== user.id) throw new NotFoundError("Certificate not found");
  if (certificate.status !== CertificateStatus.ACTIVE || certificate.type !== "TRAINING_COMPLETION") {
    throw new ConflictError("Only an active Industrial Training certificate can be printed.");
  }
  const collegeName = profile?.college?.name ?? null;
  if (input.deliveryType === "COLLEGE_BULK" && !collegeName) {
    throw new ValidationError("Add your college in My Profile to use bulk delivery through your college.");
  }

  const order = await createOrder({
    amountPaise: option.pricePaise,
    receipt: `print-${certificate.id}`.slice(0, 40),
    notes: { certificateId: certificate.id, purpose: "CERTIFICATE_PRINT" },
  });
  if (order.amount !== option.pricePaise || order.currency !== "INR") {
    throw new PaymentsUnavailableError("The payment order did not match the price. Please try again.");
  }
  const courier = input.deliveryType === "COURIER";
  await prisma.certificatePrintOrder.create({
    data: {
      certificateId: certificate.id,
      userId: user.id,
      deliveryType: input.deliveryType,
      recipientName: input.recipientName,
      phone: input.phone,
      addressLine1: courier ? input.addressLine1 : null,
      addressLine2: courier ? input.addressLine2 || null : null,
      city: courier ? input.city : null,
      state: courier ? input.state : null,
      pincode: courier ? input.pincode : null,
      collegeName: courier ? null : collegeName,
      amountPaise: option.pricePaise,
      razorpayOrderId: order.id,
    },
  });
  return { keyId: config.keyId, orderId: order.id, amountPaise: option.pricePaise, prefill: { name: account.name, email: account.email, contact: input.phone } };
}

/** Whether a Razorpay order belongs to a printed certificate order. */
export async function isPrintOrder(razorpayOrderId: string): Promise<boolean> {
  return Boolean(await prisma.certificatePrintOrder.findUnique({ where: { razorpayOrderId }, select: { id: true } }));
}

async function queuePrintEmail(tx: Prisma.TransactionClient, orderId: string, status: PrintOrderStatus, now: Date) {
  const order = await tx.certificatePrintOrder.findUnique({
    where: { id: orderId },
    select: { deliveryType: true, amountPaise: true, receiptNo: true, courierName: true, trackingNo: true, user: { select: { name: true, email: true } } },
  });
  if (!order) return;
  await queueAutomationEmailsOnce(
    [
      {
        recipientEmail: order.user.email,
        templateName: PRINT_ORDER_UPDATE_TEMPLATE,
        payload: {
          recipientName: order.user.name,
          status,
          delivery: DELIVERY_LABELS[order.deliveryType],
          amount: formatInr(order.amountPaise),
          receiptNo: order.receiptNo,
          courierName: order.courierName,
          trackingNo: order.trackingNo,
        },
        dedupeKey: `${PRINT_ORDER_UPDATE_TEMPLATE}:${orderId}:${status}`,
      },
    ],
    { prefix: PRINT_ORDER_UPDATE_TEMPLATE, now, db: tx }
  );
}

/** Records a captured payment for a print order (browser confirmation or webhook); idempotent. */
export async function recordPrintPaymentCaptured(input: { orderId: string; paymentId: string; amountPaise: number }): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "certificate_print_orders" WHERE "razorpayOrderId" = ${input.orderId} FOR UPDATE`;
    const order = await tx.certificatePrintOrder.findUnique({ where: { razorpayOrderId: input.orderId }, select: { id: true, status: true, amountPaise: true, userId: true } });
    if (!order) throw new NotFoundError("Unknown print order");
    if (order.status !== PrintOrderStatus.PENDING_PAYMENT) return;
    if (order.amountPaise !== input.amountPaise) {
      logger.error("Print order paid amount differs from the order", undefined, { orderId: input.orderId });
      throw new ConflictError("The paid amount does not match the order.");
    }
    const now = new Date();
    await tx.certificatePrintOrder.update({
      where: { id: order.id },
      data: { status: PrintOrderStatus.PAID, razorpayPaymentId: input.paymentId, paidAt: now, receiptNo: await nextReceiptNumber(tx, now) },
    });
    await tx.auditLog.create({
      data: { actorId: order.userId, actorRole: "CANDIDATE", action: "PRINT_ORDER_PAID", resourceType: "CertificatePrintOrder", resourceId: order.id, diffPayload: { orderId: input.orderId, paymentId: input.paymentId } },
    });
    await queuePrintEmail(tx, order.id, PrintOrderStatus.PAID, now);
  });
}

/** Browser confirmation after Razorpay Checkout: signature, then the fetched payment decides. */
export async function confirmPrintCheckout(user: AuthenticatedUser, input: { orderId: string; paymentId: string; signature: string }) {
  const config = getRazorpayConfig();
  if (!config) throw new PaymentsUnavailableError();
  if (!isValidPaymentSignature(input.orderId, input.paymentId, input.signature, config.keySecret)) {
    throw new ValidationError("The payment could not be verified.");
  }
  const order = await prisma.certificatePrintOrder.findUnique({ where: { razorpayOrderId: input.orderId }, select: { userId: true, amountPaise: true } });
  if (!order || order.userId !== user.id) throw new NotFoundError("Unknown order");
  const remote = await fetchPayment(input.paymentId);
  if (remote.order_id !== input.orderId || remote.amount !== order.amountPaise || remote.currency !== "INR") {
    throw new ValidationError("The payment does not match this order.");
  }
  if (remote.status === "authorized") await capturePayment(input.paymentId, remote.amount).catch(async (error) => {
    if ((await fetchPayment(input.paymentId).catch(() => null))?.status !== "captured") throw error;
  });
  else if (remote.status !== "captured") throw new ConflictError("The payment has not gone through yet.");
  await recordPrintPaymentCaptured({ orderId: input.orderId, paymentId: input.paymentId, amountPaise: remote.amount });
}

/** Webhook payment.authorized for a print order: capture after checking the amount. */
export async function capturePrintPayment(input: { orderId: string; paymentId: string; amountPaise: number }) {
  const order = await prisma.certificatePrintOrder.findUnique({ where: { razorpayOrderId: input.orderId }, select: { amountPaise: true, status: true } });
  if (!order) throw new NotFoundError("Unknown print order");
  if (order.status !== PrintOrderStatus.PENDING_PAYMENT) return;
  if (order.amountPaise !== input.amountPaise) throw new ConflictError("The paid amount does not match the order.");
  await capturePayment(input.paymentId, input.amountPaise).catch(async (error) => {
    if ((await fetchPayment(input.paymentId).catch(() => null))?.status !== "captured") throw error;
  });
  await recordPrintPaymentCaptured(input);
}

/** The student's paid print orders for one certificate (or all). */
export async function listMyPrintOrders(userId: string, certificateId?: string) {
  return prisma.certificatePrintOrder.findMany({
    where: { userId, status: { not: PrintOrderStatus.PENDING_PAYMENT }, ...(certificateId ? { certificateId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      deliveryType: true,
      status: true,
      amountPaise: true,
      receiptNo: true,
      paidAt: true,
      courierName: true,
      trackingNo: true,
      shippedAt: true,
      deliveredAt: true,
      city: true,
      collegeName: true,
    },
  });
}

// ----------------------------------------------------------------------------- staff

function assertAdmin(user: AuthenticatedUser) {
  if (!user.roles.includes(Role.ADMIN)) throw new ForbiddenError("Only administrators can manage print orders.");
}

export async function listPrintOrdersForStaff(user: AuthenticatedUser, status: PrintOrderStatus | null) {
  assertAdmin(user);
  return prisma.certificatePrintOrder.findMany({
    where: status ? { status } : { status: { not: PrintOrderStatus.PENDING_PAYMENT } },
    orderBy: [{ status: "asc" }, { paidAt: "asc" }],
    take: 300,
    select: {
      id: true,
      deliveryType: true,
      status: true,
      recipientName: true,
      phone: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      pincode: true,
      collegeName: true,
      amountPaise: true,
      receiptNo: true,
      paidAt: true,
      courierName: true,
      trackingNo: true,
      certificate: { select: { verificationCode: true, recipientName: true, programmeTitle: true, id: true } },
      user: { select: { email: true } },
    },
  });
}

export type StaffPrintOrder = Awaited<ReturnType<typeof listPrintOrdersForStaff>>[number];

const NEXT_STATUS: Partial<Record<PrintOrderStatus, PrintOrderStatus>> = {
  PAID: PrintOrderStatus.PRINTED,
  PRINTED: PrintOrderStatus.SHIPPED,
  SHIPPED: PrintOrderStatus.DELIVERED,
};

const statusUpdateSchema = z.object({
  orderId: z.uuid(),
  status: z.enum(["PRINTED", "SHIPPED", "DELIVERED"]),
  courierName: z.string().trim().max(80).optional(),
  trackingNo: z.string().trim().max(60).optional(),
});

/** Administrators: move a paid order one step (printed → shipped with tracking → delivered). */
export async function advancePrintOrder(user: AuthenticatedUser, raw: unknown, now: Date) {
  assertAdmin(user);
  const parsed = statusUpdateSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid update.");
  const input = parsed.data;
  return prisma.$transaction(async (tx) => {
    const order = await tx.certificatePrintOrder.findUnique({ where: { id: input.orderId }, select: { id: true, status: true, deliveryType: true } });
    if (!order) throw new NotFoundError("Print order not found");
    if (NEXT_STATUS[order.status] !== input.status) throw new ConflictError(`An order that is ${order.status.toLowerCase()} cannot become ${input.status.toLowerCase()}.`);
    if (input.status === "SHIPPED" && order.deliveryType === "COURIER" && !input.trackingNo) {
      throw new ValidationError("Enter the courier tracking number.");
    }
    const updated = await tx.certificatePrintOrder.updateMany({
      where: { id: order.id, status: order.status },
      data: {
        status: input.status,
        updatedById: user.id,
        ...(input.status === "PRINTED" ? { printedAt: now } : {}),
        ...(input.status === "SHIPPED" ? { shippedAt: now, courierName: input.courierName || PRINTED_CERTIFICATE.courierPartner, trackingNo: input.trackingNo || null } : {}),
        ...(input.status === "DELIVERED" ? { deliveredAt: now } : {}),
      },
    });
    if (updated.count !== 1) throw new ConflictError("This order changed. Please reload.");
    await tx.auditLog.create({
      data: { actorId: user.id, actorRole: Role.ADMIN, action: `PRINT_ORDER_${input.status}`, resourceType: "CertificatePrintOrder", resourceId: order.id, diffPayload: { trackingNo: input.trackingNo ?? null } },
    });
    if (input.status !== "PRINTED") await queuePrintEmail(tx, order.id, input.status, now);
  });
}

/** Payment Receipt PDF of a paid print order: its owner or an administrator. */
export async function getPrintReceiptPdf(orderId: string, actor: { id: string; roles: Role[] }) {
  const order = await prisma.certificatePrintOrder.findUnique({
    where: { id: orderId },
    select: {
      userId: true,
      deliveryType: true,
      amountPaise: true,
      receiptNo: true,
      paidAt: true,
      razorpayPaymentId: true,
      user: { select: { name: true, email: true } },
      certificate: { select: { programmeTitle: true, verificationCode: true } },
    },
  });
  if (!order || (order.userId !== actor.id && !actor.roles.includes(Role.ADMIN))) throw new NotFoundError("Receipt not found");
  if (!order.receiptNo || !order.paidAt || !order.razorpayPaymentId) throw new ConflictError("This order has not been paid.");
  const facts = confirmedCompanyFacts();
  const statutory = facts.filter((fact) => fact.label === "CIN" || fact.label === "Udyam Registration No.").map((fact) => `${fact.label}: ${fact.value}`);
  const office = facts.find((fact) => fact.label === "Registered office");
  const buffer = buildPaymentReceiptPdf({
    receiptNo: order.receiptNo,
    paidAt: order.paidAt,
    timeZone: BUSINESS_TIME_ZONE,
    companyName: (COMPANY.registeredName ?? COMPANY.brandName).toUpperCase(),
    companyLines: [statutory.join("  |  "), office ? `Registered office: ${office.value}` : ""].filter(Boolean),
    studentName: order.user.name,
    studentEmail: order.user.email,
    programTitle: `Printed certificate: ${order.certificate.programmeTitle}`,
    batchName: `${DELIVERY_LABELS[order.deliveryType]} · ${order.certificate.verificationCode}`,
    listPrice: formatInr(order.amountPaise),
    discount: null,
    amountPaid: formatInr(order.amountPaise),
    paymentReference: order.razorpayPaymentId,
    contactEmail: COMPANY.contactEmail,
  });
  return { buffer, filename: `GARA_Payment_Receipt_${order.receiptNo.replace(/[^A-Za-z0-9-]/g, "")}.pdf` };
}
