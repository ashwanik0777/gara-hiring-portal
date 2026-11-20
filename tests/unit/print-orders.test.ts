import { describe, it, expect, vi, beforeEach } from "vitest";

const { db, rp, prices } = vi.hoisted(() => ({
  db: {
    user: { findUnique: vi.fn() },
    certificate: { findUnique: vi.fn() },
    candidateProfile: { findUnique: vi.fn() },
    certificatePrintOrder: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    notificationOutbox: { createMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  rp: { getRazorpayConfig: vi.fn(), createOrder: vi.fn(), fetchPayment: vi.fn(), capturePayment: vi.fn() },
  prices: { COLLEGE_BULK: null as number | null, COURIER: null as number | null },
}));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/infrastructure/payments/razorpay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/infrastructure/payments/razorpay")>()),
  ...rp,
}));
vi.mock("@/config/site", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/site")>();
  return { ...actual, PRINTED_CERTIFICATE: { pricesPaise: prices, expectedDelivery: { COLLEGE_BULK: null, COURIER: "7–10 working days" }, courierPartner: null } };
});

import { Role } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  advancePrintOrder,
  printOptions,
  recordPrintPaymentCaptured,
  startPrintCheckout,
} from "@/features/print-orders/services/print-order-service";
import { renderPrintOrderUpdateEmail } from "@/infrastructure/email/templates/print-order-emails";

const STUDENT: AuthenticatedUser = { id: "student-1", email: "s@example.test", name: "Asha", roles: [Role.CANDIDATE] };
const ADMIN: AuthenticatedUser = { id: "admin-1", email: "a@example.test", name: "Admin", roles: [Role.ADMIN] };
const CERTIFICATE_ID = "11111111-1111-4111-8111-111111111111";
const ORDER_ID = "22222222-2222-4222-8222-222222222222";
const courier = {
  certificateId: CERTIFICATE_ID,
  deliveryType: "COURIER",
  recipientName: "Asha Rao",
  phone: "9876543210",
  addressLine1: "12 MG Road",
  city: "Noida",
  state: "Uttar Pradesh",
  pincode: "201301",
};

beforeEach(() => {
  vi.resetAllMocks();
  prices.COLLEGE_BULK = null;
  prices.COURIER = 14_900;
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  db.$queryRaw.mockImplementation((strings: TemplateStringsArray) => Promise.resolve(strings.join("?").includes("nextval") ? [{ value: BigInt(7) }] : []));
  db.notificationOutbox.createMany.mockResolvedValue({ count: 1 });
  db.auditLog.create.mockResolvedValue({});
  rp.getRazorpayConfig.mockReturnValue({ keyId: "rzp_test_x", keySecret: "s", webhookSecret: "w" });
  db.user.findUnique.mockResolvedValue({ name: "Asha", email: "s@example.test", emailVerified: true });
  db.certificate.findUnique.mockResolvedValue({ id: CERTIFICATE_ID, status: "ACTIVE", type: "TRAINING_COMPLETION", trainingEnrollment: { userId: STUDENT.id } });
  db.candidateProfile.findUnique.mockResolvedValue({ college: { name: "ABC Institute" } });
  rp.createOrder.mockResolvedValue({ id: "order_P1", amount: 14_900, currency: "INR", status: "created" });
});

describe("printed certificate options", () => {
  it("offers only delivery options with a price set by the product owner", () => {
    expect(printOptions().map((option) => option.type)).toEqual(["COURIER"]);
    prices.COURIER = null;
    expect(printOptions()).toEqual([]);
  });
});

describe("startPrintCheckout", () => {
  it("refuses a closed option, another student's certificate and a non-training certificate", async () => {
    await expect(startPrintCheckout(STUDENT, { ...courier, deliveryType: "COLLEGE_BULK" })).rejects.toBeInstanceOf(ConflictError);
    db.certificate.findUnique.mockResolvedValue({ id: CERTIFICATE_ID, status: "ACTIVE", type: "TRAINING_COMPLETION", trainingEnrollment: { userId: "other" } });
    await expect(startPrintCheckout(STUDENT, courier)).rejects.toBeInstanceOf(NotFoundError);
    db.certificate.findUnique.mockResolvedValue({ id: CERTIFICATE_ID, status: "REVOKED", type: "TRAINING_COMPLETION", trainingEnrollment: { userId: STUDENT.id } });
    await expect(startPrintCheckout(STUDENT, courier)).rejects.toBeInstanceOf(ConflictError);
  });

  it("needs a full courier address and a verified email", async () => {
    await expect(startPrintCheckout(STUDENT, { ...courier, pincode: "12345" })).rejects.toBeInstanceOf(ValidationError);
    db.user.findUnique.mockResolvedValue({ name: "Asha", email: "s@example.test", emailVerified: false });
    await expect(startPrintCheckout(STUDENT, courier)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("needs the college for bulk delivery", async () => {
    prices.COLLEGE_BULK = 9_900;
    db.candidateProfile.findUnique.mockResolvedValue({ college: null });
    await expect(startPrintCheckout(STUDENT, { ...courier, deliveryType: "COLLEGE_BULK" })).rejects.toThrow("Add your college");
  });

  it("creates the order for the configured price", async () => {
    const session = await startPrintCheckout(STUDENT, courier);
    expect(session).toMatchObject({ orderId: "order_P1", amountPaise: 14_900 });
    expect(rp.createOrder.mock.calls[0][0]).toMatchObject({ amountPaise: 14_900 });
    expect(db.certificatePrintOrder.create.mock.calls[0][0].data).toMatchObject({
      deliveryType: "COURIER",
      amountPaise: 14_900,
      pincode: "201301",
      collegeName: null,
      razorpayOrderId: "order_P1",
    });
  });
});

describe("print payments", () => {
  it("marks the order paid with a receipt number once", async () => {
    db.certificatePrintOrder.findUnique
      .mockResolvedValueOnce({ id: ORDER_ID, status: "PENDING_PAYMENT", amountPaise: 14_900, userId: STUDENT.id })
      .mockResolvedValueOnce({ deliveryType: "COURIER", amountPaise: 14_900, receiptNo: "GARA-RCPT-2027-000007", courierName: null, trackingNo: null, user: { name: "Asha", email: "s@example.test" } });
    await recordPrintPaymentCaptured({ orderId: "order_P1", paymentId: "pay_1", amountPaise: 14_900 });
    expect(db.certificatePrintOrder.update.mock.calls[0][0].data).toMatchObject({ status: "PAID", razorpayPaymentId: "pay_1" });
    expect(db.certificatePrintOrder.update.mock.calls[0][0].data.receiptNo).toMatch(/^GARA-RCPT-\d{4}-000007$/);

    vi.clearAllMocks();
    db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
    db.certificatePrintOrder.findUnique.mockResolvedValue({ id: ORDER_ID, status: "PAID", amountPaise: 14_900, userId: STUDENT.id });
    await recordPrintPaymentCaptured({ orderId: "order_P1", paymentId: "pay_1", amountPaise: 14_900 });
    expect(db.certificatePrintOrder.update).not.toHaveBeenCalled();
  });

  it("refuses a different amount", async () => {
    db.certificatePrintOrder.findUnique.mockResolvedValue({ id: ORDER_ID, status: "PENDING_PAYMENT", amountPaise: 14_900, userId: STUDENT.id });
    await expect(recordPrintPaymentCaptured({ orderId: "order_P1", paymentId: "pay_1", amountPaise: 100 })).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("advancePrintOrder", () => {
  it("is for administrators and moves one step at a time", async () => {
    await expect(advancePrintOrder(STUDENT, { orderId: ORDER_ID, status: "PRINTED" }, new Date())).rejects.toBeInstanceOf(ForbiddenError);
    db.certificatePrintOrder.findUnique.mockResolvedValue({ id: ORDER_ID, status: "PAID", deliveryType: "COURIER" });
    await expect(advancePrintOrder(ADMIN, { orderId: ORDER_ID, status: "SHIPPED", trackingNo: "X1" }, new Date())).rejects.toBeInstanceOf(ConflictError);
  });

  it("needs a tracking number to ship by courier", async () => {
    db.certificatePrintOrder.findUnique.mockResolvedValue({ id: ORDER_ID, status: "PRINTED", deliveryType: "COURIER" });
    await expect(advancePrintOrder(ADMIN, { orderId: ORDER_ID, status: "SHIPPED" }, new Date())).rejects.toBeInstanceOf(ValidationError);
    db.certificatePrintOrder.updateMany.mockResolvedValue({ count: 1 });
    db.certificatePrintOrder.findUnique
      .mockResolvedValueOnce({ id: ORDER_ID, status: "PRINTED", deliveryType: "COURIER" })
      .mockResolvedValueOnce({ deliveryType: "COURIER", amountPaise: 14_900, receiptNo: "R", courierName: "Blue Dart", trackingNo: "BD123", user: { name: "Asha", email: "s@example.test" } });
    await advancePrintOrder(ADMIN, { orderId: ORDER_ID, status: "SHIPPED", trackingNo: "BD123", courierName: "Blue Dart" }, new Date());
    expect(db.certificatePrintOrder.updateMany.mock.calls[0][0].data).toMatchObject({ status: "SHIPPED", trackingNo: "BD123" });
    expect(db.notificationOutbox.createMany.mock.calls[0][0].data[0].templateName).toBe("PRINT_ORDER_UPDATE");
  });
});

describe("print order emails", () => {
  it("shows the tracking number when shipped", () => {
    const email = renderPrintOrderUpdateEmail({ status: "SHIPPED", courierName: "Blue Dart", trackingNo: "BD123", delivery: "Courier" });
    expect(email.subject).toContain("on its way");
    expect(email.text).toContain("BD123");
  });
});
