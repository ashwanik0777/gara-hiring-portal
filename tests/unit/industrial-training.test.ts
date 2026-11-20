import { createHmac } from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { db, rp, outbox } = vi.hoisted(() => {
  const db = {
    user: { findUnique: vi.fn() },
    trainingBatch: { findUnique: vi.fn() },
    trainingEnrollment: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    trainingPayment: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    trainingRefund: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    notificationOutbox: { createMany: vi.fn() },
    ambassadorCommission: { updateMany: vi.fn(), create: vi.fn() },
    certificatePrintOrder: { findUnique: vi.fn() },
    campusAmbassador: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    paymentWebhookEvent: { findUnique: vi.fn(), create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  return {
    db,
    rp: {
      getRazorpayConfig: vi.fn(),
      createOrder: vi.fn(),
      fetchPayment: vi.fn(),
      capturePayment: vi.fn(),
      createRefund: vi.fn(),
    },
    outbox: { scheduleOutboxFlush: vi.fn() },
  };
});

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/infrastructure/email/outbox-dispatch", () => outbox);
vi.mock("@/infrastructure/payments/razorpay", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infrastructure/payments/razorpay")>();
  return { ...actual, ...rp };
});

import { Role } from "@prisma/client";
import { NextRequest } from "next/server";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { formatInr, paiseToRupeesInput, rupeesToPaise } from "@/features/training/money";
import { canTransfer, isRefundWindowOpen, refundAmountPaise, refundWindowClosesAt } from "@/features/training/policy";
import { trainingBatchSchema, trainingProgramSchema } from "@/features/training/schemas";
import {
  isValidPaymentSignature,
  isValidWebhookSignature,
  PaymentsUnavailableError,
} from "@/infrastructure/payments/razorpay";
import {
  captureAuthorizedPayment,
  confirmCheckout,
  recordCapturedPayment,
  startCheckout,
} from "@/features/training/services/checkout-service";
import { decideRefund, recordRefundUpdate, requestRefund, transferEnrollment } from "@/features/training/services/refund-service";
import { buildPaymentReceiptPdf } from "@/infrastructure/pdf/payment-receipt-pdf-generator";
import {
  renderTrainingPaymentReceivedEmail,
  renderTrainingRefundUpdateEmail,
} from "@/infrastructure/email/templates/training-emails";
import { POST as razorpayWebhook } from "@/app/api/webhooks/razorpay/route";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const KEY_SECRET = "test_key_secret";
const WEBHOOK_SECRET = "test_webhook_secret";
const CONFIG = { keyId: "rzp_test_abc123", keySecret: KEY_SECRET, webhookSecret: WEBHOOK_SECRET };

const STUDENT: AuthenticatedUser = { id: "student-1", email: "student@example.test", name: "Asha Rao", roles: [Role.CANDIDATE] };
const ADMIN: AuthenticatedUser = { id: "admin-1", email: "admin@example.test", name: "Admin", roles: [Role.ADMIN] };
const HR: AuthenticatedUser = { id: "hr-1", email: "hr@example.test", name: "HR", roles: [Role.HR] };

const BATCH_ID = "11111111-1111-4111-8111-111111111111";
const ENROLLMENT_ID = "22222222-2222-4222-8222-222222222222";
const REFUND_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_BATCH_ID = "44444444-4444-4444-8444-444444444444";

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function batch(overrides: Record<string, unknown> = {}) {
  return {
    id: BATCH_ID,
    programId: "program-1",
    name: "January 2027",
    status: "UPCOMING",
    startDate: new Date(Date.now() + 10 * DAY),
    firstClassAt: null,
    enrollmentDeadline: null,
    seats: 30,
    program: { title: "Full-Stack Web Development", feePaise: 499_900, status: "PUBLISHED" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  db.$queryRaw.mockImplementation((strings: TemplateStringsArray) =>
    Promise.resolve(strings.join("?").includes("nextval") ? [{ value: BigInt(42) }] : [])
  );
  db.notificationOutbox.createMany.mockResolvedValue({ count: 1 });
  db.auditLog.create.mockResolvedValue({});
  rp.getRazorpayConfig.mockReturnValue(CONFIG);
});

// -----------------------------------------------------------------------------
// Money, policy and schemas
// -----------------------------------------------------------------------------

describe("training money", () => {
  it("converts typed rupees to paise and back", () => {
    expect(rupeesToPaise("4999")).toBe(499_900);
    expect(rupeesToPaise("4,999.5")).toBe(499_950);
    expect(rupeesToPaise("₹ 10.05")).toBe(1_005);
    expect(rupeesToPaise("0")).toBeNull();
    expect(rupeesToPaise("-5")).toBeNull();
    expect(rupeesToPaise("12.345")).toBeNull();
    expect(rupeesToPaise("abc")).toBeNull();
    expect(paiseToRupeesInput(499_900)).toBe("4999");
    expect(paiseToRupeesInput(499_950)).toBe("4999.50");
  });

  it("formats paise as Indian rupees", () => {
    expect(formatInr(499_900)).toBe("₹4,999");
    expect(formatInr(12_345_650)).toBe("₹1,23,456.5");
  });
});

describe("training refund and transfer policy", () => {
  const start = new Date("2027-01-10T04:30:00Z");

  it("closes the window at the start date without a first live class", () => {
    expect(refundWindowClosesAt({ startDate: start, firstClassAt: null })).toEqual(start);
    expect(isRefundWindowOpen({ startDate: start, firstClassAt: null }, new Date(start.getTime() - 1))).toBe(true);
    expect(isRefundWindowOpen({ startDate: start, firstClassAt: null }, start)).toBe(false);
  });

  it("keeps the window open for 24 hours after the first live class", () => {
    const firstClassAt = new Date(start.getTime() + 13 * HOUR);
    const closes = new Date(firstClassAt.getTime() + 24 * HOUR);
    expect(refundWindowClosesAt({ startDate: start, firstClassAt })).toEqual(closes);
    expect(isRefundWindowOpen({ startDate: start, firstClassAt }, new Date(closes.getTime() - 1))).toBe(true);
    expect(isRefundWindowOpen({ startDate: start, firstClassAt }, closes)).toBe(false);
  });

  it("allows one free transfer, only after the refund window", () => {
    const afterWindow = new Date(start.getTime() + 1);
    expect(canTransfer({ transferCount: 0 }, { startDate: start, firstClassAt: null }, new Date(start.getTime() - 1))).toBe(false);
    expect(canTransfer({ transferCount: 0 }, { startDate: start, firstClassAt: null }, afterWindow)).toBe(true);
    expect(canTransfer({ transferCount: 1 }, { startDate: start, firstClassAt: null }, afterWindow)).toBe(false);
  });

  it("refunds the amount paid minus Razorpay's fee including GST (product owner, 2026-11-20)", () => {
    expect(refundAmountPaise(499_900, 11_798)).toBe(488_102);
    expect(refundAmountPaise(100, 500)).toBe(0);
  });
});

describe("training schemas", () => {
  const program = {
    title: "Full-Stack Web Development",
    slug: "full-stack-web-development",
    trackId: "",
    summary: "Build and deploy real web apps with mentors.",
    description: "A mentor-led programme covering frontend, backend and deployment.",
    syllabus: [{ week: 1, title: "Foundations", topics: ["HTML", "CSS"] }],
    durationWeeks: 8,
    feeRupees: "4999",
    prerequisites: "",
    outcomes: null,
    status: "PUBLISHED",
  };

  it("accepts a valid programme and rejects a bad fee or slug", () => {
    expect(trainingProgramSchema.safeParse(program).success).toBe(true);
    expect(trainingProgramSchema.safeParse({ ...program, feeRupees: "free" }).success).toBe(false);
    expect(trainingProgramSchema.safeParse({ ...program, slug: "Full Stack" }).success).toBe(false);
  });

  it("rejects a batch that ends before it starts", () => {
    const base = { programId: BATCH_ID, name: "Jan 2027", startDate: "2027-01-10", seats: 30, status: "UPCOMING" };
    expect(trainingBatchSchema.safeParse({ ...base, endDate: "2027-03-10", firstClassAt: "2027-01-10T19:00" }).success).toBe(true);
    expect(trainingBatchSchema.safeParse({ ...base, endDate: "2027-01-01" }).success).toBe(false);
    expect(trainingBatchSchema.safeParse({ ...base, seats: 0 }).success).toBe(false);
  });
});

describe("Razorpay signatures", () => {
  it("verifies the checkout signature over order|payment", () => {
    const signature = sign("order_ABC|pay_XYZ", KEY_SECRET);
    expect(isValidPaymentSignature("order_ABC", "pay_XYZ", signature, KEY_SECRET)).toBe(true);
    expect(isValidPaymentSignature("order_ABC", "pay_OTHER", signature, KEY_SECRET)).toBe(false);
    expect(isValidPaymentSignature("order_ABC", "pay_XYZ", "00", KEY_SECRET)).toBe(false);
  });

  it("verifies the webhook signature over the raw body", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    expect(isValidWebhookSignature(body, sign(body, WEBHOOK_SECRET), WEBHOOK_SECRET)).toBe(true);
    expect(isValidWebhookSignature(`${body} `, sign(body, WEBHOOK_SECRET), WEBHOOK_SECRET)).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// Checkout
// -----------------------------------------------------------------------------

describe("startCheckout", () => {
  beforeEach(() => {
    db.user.findUnique.mockResolvedValue({ name: "Asha Rao", email: "student@example.test", emailVerified: true });
    db.trainingBatch.findUnique.mockResolvedValue(batch());
    db.trainingEnrollment.findUnique.mockResolvedValue(null);
    db.trainingEnrollment.count.mockResolvedValue(3);
    db.trainingEnrollment.create.mockResolvedValue({ id: ENROLLMENT_ID });
    rp.createOrder.mockResolvedValue({ id: "order_ABC", amount: 499_900, currency: "INR", status: "created" });
    db.trainingPayment.create.mockResolvedValue({});
  });

  it("is switched off while Razorpay is not configured", async () => {
    rp.getRazorpayConfig.mockReturnValue(null);
    await expect(startCheckout(STUDENT, { batchId: BATCH_ID, consent: true })).rejects.toBeInstanceOf(PaymentsUnavailableError);
  });

  it("requires consent and a verified email", async () => {
    await expect(startCheckout(STUDENT, { batchId: BATCH_ID, consent: false })).rejects.toBeInstanceOf(ValidationError);
    db.user.findUnique.mockResolvedValue({ name: "Asha", email: "a@example.test", emailVerified: false });
    await expect(startCheckout(STUDENT, { batchId: BATCH_ID, consent: true })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses a full batch, a closed batch and a second enrollment", async () => {
    db.trainingEnrollment.count.mockResolvedValue(30);
    await expect(startCheckout(STUDENT, { batchId: BATCH_ID, consent: true })).rejects.toThrow("full");

    db.trainingEnrollment.count.mockResolvedValue(0);
    db.trainingBatch.findUnique.mockResolvedValue(batch({ enrollmentDeadline: new Date(Date.now() - DAY) }));
    await expect(startCheckout(STUDENT, { batchId: BATCH_ID, consent: true })).rejects.toThrow("closed");

    db.trainingBatch.findUnique.mockResolvedValue(batch());
    db.trainingEnrollment.findUnique.mockResolvedValue({ id: ENROLLMENT_ID, status: "ACTIVE" });
    await expect(startCheckout(STUDENT, { batchId: BATCH_ID, consent: true })).rejects.toThrow("already enrolled");

    db.trainingEnrollment.findUnique.mockResolvedValue({ id: ENROLLMENT_ID, status: "REFUNDED" });
    await expect(startCheckout(STUDENT, { batchId: BATCH_ID, consent: true })).rejects.toThrow("refunded");
    expect(rp.createOrder).not.toHaveBeenCalled();
  });

  it("holds a seat for 15 minutes and creates an order for the stored fee", async () => {
    const before = Date.now();
    const session = await startCheckout(STUDENT, { batchId: BATCH_ID, consent: true });

    expect(session).toMatchObject({ keyId: CONFIG.keyId, orderId: "order_ABC", amountPaise: 499_900, enrollmentId: ENROLLMENT_ID });
    const created = db.trainingEnrollment.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ status: "PENDING_PAYMENT", listPricePaise: 499_900, userId: STUDENT.id, batchId: BATCH_ID });
    const holdMinutes = (created.seatHoldExpiresAt.getTime() - before) / 60_000;
    expect(holdMinutes).toBeGreaterThan(14.9);
    expect(holdMinutes).toBeLessThan(15.1);
    expect(rp.createOrder).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 499_900, receipt: ENROLLMENT_ID }));
    expect(db.trainingPayment.create).toHaveBeenCalledWith({
      data: {
        enrollmentId: ENROLLMENT_ID,
        razorpayOrderId: "order_ABC",
        amountPaise: 499_900,
        listPricePaise: 499_900,
        discountPaise: 0,
        referralCode: null,
      },
    });
  });

  it("refuses an order whose amount differs from the fee", async () => {
    rp.createOrder.mockResolvedValue({ id: "order_ABC", amount: 100, currency: "INR", status: "created" });
    await expect(startCheckout(STUDENT, { batchId: BATCH_ID, consent: true })).rejects.toBeInstanceOf(PaymentsUnavailableError);
    expect(db.trainingPayment.create).not.toHaveBeenCalled();
  });
});

describe("recordCapturedPayment", () => {
  const capture = { orderId: "order_ABC", paymentId: "pay_XYZ", amountPaise: 499_900, source: "webhook" as const };

  function pendingPayment(enrollmentStatus = "PENDING_PAYMENT", receiptNo: string | null = null) {
    return {
      id: "payment-1",
      enrollmentId: ENROLLMENT_ID,
      amountPaise: 499_900,
      status: "CREATED",
      enrollment: { id: ENROLLMENT_ID, status: enrollmentStatus, receiptNo, userId: STUDENT.id },
    };
  }

  beforeEach(() => {
    db.trainingEnrollment.findUnique.mockResolvedValue({
      receiptNo: "GARA-RCPT-2026-000042",
      amountPaidPaise: 499_900,
      paidAt: new Date(),
      user: { name: "Asha Rao", email: "student@example.test" },
      batch: { name: "January 2027", startDate: new Date(Date.now() + 10 * DAY), firstClassAt: null, program: { title: "Full-Stack" } },
    });
  });

  it("activates the enrollment, numbers the receipt and queues the email once", async () => {
    db.trainingPayment.findUnique.mockResolvedValue(pendingPayment());
    const result = await recordCapturedPayment(capture);

    expect(result).toEqual({ enrollmentId: ENROLLMENT_ID, newlyRecorded: true, duplicate: false });
    expect(db.trainingPayment.update.mock.calls[0][0].data).toMatchObject({ status: "CAPTURED", razorpayPaymentId: "pay_XYZ" });
    const activated = db.trainingEnrollment.update.mock.calls[0][0].data;
    expect(activated).toMatchObject({ status: "ACTIVE", amountPaidPaise: 499_900, seatHoldExpiresAt: null });
    expect(activated.receiptNo).toMatch(/^GARA-RCPT-\d{4}-000042$/);
    const queued = db.notificationOutbox.createMany.mock.calls[0][0];
    expect(queued.skipDuplicates).toBe(true);
    expect(queued.data[0]).toMatchObject({
      templateName: "TRAINING_PAYMENT_RECEIVED",
      recipientEmail: "student@example.test",
      dedupeKey: `TRAINING_PAYMENT_RECEIVED:${ENROLLMENT_ID}:GARA-RCPT-2026-000042`,
    });
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe("TRAINING_PAYMENT_CAPTURED");
  });

  it("is idempotent when the payment was already recorded", async () => {
    db.trainingPayment.findUnique.mockResolvedValue({ ...pendingPayment("ACTIVE"), status: "CAPTURED" });
    const result = await recordCapturedPayment(capture);
    expect(result.newlyRecorded).toBe(false);
    expect(db.trainingPayment.update).not.toHaveBeenCalled();
    expect(db.notificationOutbox.createMany).not.toHaveBeenCalled();
  });

  it("refuses an amount that differs from the order", async () => {
    db.trainingPayment.findUnique.mockResolvedValue(pendingPayment());
    await expect(recordCapturedPayment({ ...capture, amountPaise: 100 })).rejects.toBeInstanceOf(ConflictError);
    expect(db.trainingPayment.update).not.toHaveBeenCalled();
  });

  it("flags a second payment for an enrollment that is already paid", async () => {
    db.trainingPayment.findUnique.mockResolvedValue(pendingPayment("ACTIVE", "GARA-RCPT-2026-000001"));
    const result = await recordCapturedPayment(capture);
    expect(result.duplicate).toBe(true);
    expect(db.trainingEnrollment.update).not.toHaveBeenCalled();
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe("TRAINING_DUPLICATE_PAYMENT");
  });

  it("ignores orders this portal did not create", async () => {
    db.trainingPayment.findUnique.mockResolvedValue(null);
    await expect(recordCapturedPayment(capture)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("confirmCheckout and captureAuthorizedPayment", () => {
  const signature = sign("order_ABC|pay_XYZ", KEY_SECRET);

  beforeEach(() => {
    db.trainingPayment.findUnique.mockResolvedValue({
      id: "payment-1",
      enrollmentId: ENROLLMENT_ID,
      amountPaise: 499_900,
      status: "CREATED",
      enrollment: { id: ENROLLMENT_ID, userId: STUDENT.id, status: "PENDING_PAYMENT", receiptNo: null },
    });
    db.trainingEnrollment.findUnique.mockResolvedValue(null);
  });

  it("rejects a forged signature before calling Razorpay", async () => {
    await expect(confirmCheckout(STUDENT, { orderId: "order_ABC", paymentId: "pay_XYZ", signature: "a".repeat(64) })).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(rp.fetchPayment).not.toHaveBeenCalled();
  });

  it("does not confirm another student's order", async () => {
    const other = { ...STUDENT, id: "student-2" };
    await expect(confirmCheckout(other, { orderId: "order_ABC", paymentId: "pay_XYZ", signature })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses a payment whose amount or order differs", async () => {
    rp.fetchPayment.mockResolvedValue({ id: "pay_XYZ", order_id: "order_ABC", amount: 100, currency: "INR", status: "captured" });
    await expect(confirmCheckout(STUDENT, { orderId: "order_ABC", paymentId: "pay_XYZ", signature })).rejects.toBeInstanceOf(ValidationError);
  });

  it("captures an authorized payment and records it", async () => {
    rp.fetchPayment.mockResolvedValue({ id: "pay_XYZ", order_id: "order_ABC", amount: 499_900, currency: "INR", status: "authorized" });
    rp.capturePayment.mockResolvedValue({});
    const result = await confirmCheckout(STUDENT, { orderId: "order_ABC", paymentId: "pay_XYZ", signature });
    expect(rp.capturePayment).toHaveBeenCalledWith("pay_XYZ", 499_900);
    expect(result.newlyRecorded).toBe(true);
  });

  it("treats a lost capture race as success when the payment is captured", async () => {
    rp.fetchPayment
      .mockResolvedValueOnce({ id: "pay_XYZ", order_id: "order_ABC", amount: 499_900, currency: "INR", status: "authorized" })
      .mockResolvedValueOnce({ id: "pay_XYZ", order_id: "order_ABC", amount: 499_900, currency: "INR", status: "captured" });
    rp.capturePayment.mockRejectedValue(new PaymentsUnavailableError("already captured"));
    const result = await confirmCheckout(STUDENT, { orderId: "order_ABC", paymentId: "pay_XYZ", signature });
    expect(result.enrollmentId).toBe(ENROLLMENT_ID);
  });

  it("webhook capture refuses a mismatched amount without capturing", async () => {
    await expect(captureAuthorizedPayment({ orderId: "order_ABC", paymentId: "pay_XYZ", amountPaise: 100 })).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(rp.capturePayment).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Refunds and transfers
// -----------------------------------------------------------------------------

describe("requestRefund", () => {
  function activeEnrollment(batchOverrides: Record<string, unknown> = {}) {
    return {
      id: ENROLLMENT_ID,
      userId: STUDENT.id,
      status: "ACTIVE",
      amountPaidPaise: 499_900,
      batch: { startDate: new Date(Date.now() + 2 * DAY), firstClassAt: null, ...batchOverrides },
      payments: [{ id: "payment-1" }],
    };
  }

  it("records a refund request of the amount paid minus Razorpay's fee", async () => {
    db.trainingEnrollment.findUnique.mockResolvedValue({ ...activeEnrollment(), payments: [{ id: "payment-1", razorpayPaymentId: "pay_XYZ" }] });
    rp.fetchPayment.mockResolvedValue({ id: "pay_XYZ", order_id: "order_ABC", amount: 499_900, currency: "INR", status: "captured", fee: 11_798 });
    db.trainingRefund.create.mockResolvedValue({ id: REFUND_ID, amountPaise: 488_102 });
    await requestRefund(STUDENT, { enrollmentId: ENROLLMENT_ID, reason: "Exam clash in January" });
    expect(db.trainingRefund.create.mock.calls[0][0].data).toMatchObject({ amountPaise: 488_102, status: "REQUESTED" });
  });

  it("records the request even when Razorpay cannot be reached (the amount is settled at approval)", async () => {
    db.trainingEnrollment.findUnique.mockResolvedValue({ ...activeEnrollment(), payments: [{ id: "payment-1", razorpayPaymentId: "pay_XYZ" }] });
    rp.fetchPayment.mockRejectedValue(new PaymentsUnavailableError("down"));
    db.trainingRefund.create.mockResolvedValue({ id: REFUND_ID, amountPaise: 499_900 });
    await requestRefund(STUDENT, { enrollmentId: ENROLLMENT_ID, reason: "Exam clash in January" });
    expect(db.trainingRefund.create).toHaveBeenCalled();
  });

  it("records a refund request while the window is open", async () => {
    db.trainingEnrollment.findUnique.mockResolvedValue(activeEnrollment());
    db.trainingRefund.create.mockResolvedValue({ id: REFUND_ID, amountPaise: 499_900 });
    await requestRefund(STUDENT, { enrollmentId: ENROLLMENT_ID, reason: "Exam clash in January" });
    expect(db.trainingRefund.create.mock.calls[0][0].data).toMatchObject({ amountPaise: 499_900, status: "REQUESTED", paymentId: "payment-1" });
    expect(db.trainingEnrollment.update.mock.calls[0][0].data).toEqual({ status: "REFUND_REQUESTED" });
  });

  it("refuses after the window, for someone else's enrollment and without a reason", async () => {
    db.trainingEnrollment.findUnique.mockResolvedValue(
      activeEnrollment({ startDate: new Date(Date.now() - 3 * DAY), firstClassAt: new Date(Date.now() - 2 * DAY) })
    );
    await expect(requestRefund(STUDENT, { enrollmentId: ENROLLMENT_ID, reason: "Changed my mind" })).rejects.toThrow("closed");

    db.trainingEnrollment.findUnique.mockResolvedValue({ ...activeEnrollment(), userId: "student-2" });
    await expect(requestRefund(STUDENT, { enrollmentId: ENROLLMENT_ID, reason: "Changed my mind" })).rejects.toBeInstanceOf(NotFoundError);

    await expect(requestRefund(STUDENT, { enrollmentId: ENROLLMENT_ID, reason: "no" })).rejects.toBeInstanceOf(ValidationError);
    expect(db.trainingRefund.create).not.toHaveBeenCalled();
  });
});

describe("decideRefund", () => {
  const requested = {
    id: REFUND_ID,
    enrollmentId: ENROLLMENT_ID,
    status: "REQUESTED",
    amountPaise: 499_900,
    payment: { razorpayPaymentId: "pay_XYZ" },
    enrollment: { amountPaidPaise: 499_900 },
  };

  beforeEach(() => {
    // Razorpay's fee for the payment, including GST.
    rp.fetchPayment.mockResolvedValue({ id: "pay_XYZ", order_id: "order_ABC", amount: 499_900, currency: "INR", status: "captured", fee: 11_798, tax: 1_800 });
    db.trainingRefund.findUnique.mockImplementation((args: { select?: unknown }) =>
      Promise.resolve(
        args.select
          ? {
              amountPaise: 499_900,
              decisionNote: "Batch already started for you",
              enrollment: { user: { name: "Asha Rao", email: "student@example.test" }, batch: { name: "Jan", program: { title: "Full-Stack" } } },
            }
          : requested
      )
    );
    db.trainingRefund.updateMany.mockResolvedValue({ count: 1 });
  });

  it("is for administrators only", async () => {
    await expect(decideRefund(HR, { refundId: REFUND_ID, approve: true })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("needs a note to reject, then reactivates the enrollment and emails the student", async () => {
    await expect(decideRefund(ADMIN, { refundId: REFUND_ID, approve: false })).rejects.toBeInstanceOf(ValidationError);
    const result = await decideRefund(ADMIN, { refundId: REFUND_ID, approve: false, note: "Batch already started for you" });
    expect(result.status).toBe("REJECTED");
    expect(db.trainingEnrollment.update.mock.calls[0][0].data).toEqual({ status: "ACTIVE" });
    expect(db.notificationOutbox.createMany.mock.calls[0][0].data[0]).toMatchObject({
      templateName: "TRAINING_REFUND_UPDATE",
      dedupeKey: `TRAINING_REFUND_UPDATE:${REFUND_ID}:REJECTED`,
    });
    expect(rp.createRefund).not.toHaveBeenCalled();
  });

  it("approves through Razorpay and marks the enrollment refunded when processed", async () => {
    rp.createRefund.mockResolvedValue({ id: "rfnd_1", status: "processed" });
    const result = await decideRefund(ADMIN, { refundId: REFUND_ID, approve: true });
    // The amount paid minus Razorpay's fee (incl. GST), read from Razorpay at approval.
    expect(rp.createRefund).toHaveBeenCalledWith("pay_XYZ", 488_102, { refundId: REFUND_ID });
    expect(db.trainingRefund.update.mock.calls[0][0]).toEqual({ where: { id: REFUND_ID }, data: { amountPaise: 488_102 } });
    expect(result.status).toBe("PROCESSED");
    expect(db.trainingEnrollment.update.mock.calls[0][0].data).toEqual({ status: "REFUNDED" });
  });

  it("returns the request to the queue when Razorpay refuses the refund", async () => {
    rp.createRefund.mockRejectedValue(new PaymentsUnavailableError("refused"));
    await expect(decideRefund(ADMIN, { refundId: REFUND_ID, approve: true })).rejects.toBeInstanceOf(PaymentsUnavailableError);
    expect(db.trainingRefund.update.mock.calls.at(-1)?.[0].data).toMatchObject({ status: "REQUESTED", decidedById: null });
  });

  it("explains a refund Razorpay refuses (for example a low balance) and keeps it waiting", async () => {
    rp.createRefund.mockRejectedValue(new PaymentsUnavailableError("refused", "invalid request sent"));
    await expect(decideRefund(ADMIN, { refundId: REFUND_ID, approve: true })).rejects.toThrow(/invalid request sent.*Razorpay balance/);
    expect(db.trainingRefund.update.mock.calls.at(-1)?.[0].data).toMatchObject({ status: "REQUESTED" });
  });

  it("does not approve while Razorpay's charges cannot be read", async () => {
    rp.fetchPayment.mockRejectedValue(new PaymentsUnavailableError("down"));
    await expect(decideRefund(ADMIN, { refundId: REFUND_ID, approve: true })).rejects.toThrow("charges for this payment could not be read");
    expect(rp.createRefund).not.toHaveBeenCalled();
    expect(db.trainingRefund.updateMany).not.toHaveBeenCalled();
  });

  it("cannot decide the same request twice", async () => {
    db.trainingRefund.updateMany.mockResolvedValue({ count: 0 });
    await expect(decideRefund(ADMIN, { refundId: REFUND_ID, approve: true })).rejects.toBeInstanceOf(ConflictError);
    expect(rp.createRefund).not.toHaveBeenCalled();
  });
});

describe("recordRefundUpdate", () => {
  it("is idempotent for a refund that is already final", async () => {
    db.trainingRefund.findUnique.mockResolvedValue({ id: REFUND_ID, status: "PROCESSED", enrollmentId: ENROLLMENT_ID });
    await recordRefundUpdate("rfnd_1", "processed");
    expect(db.trainingRefund.update).not.toHaveBeenCalled();
  });
});

describe("transferEnrollment", () => {
  function enrollment(transferCount: number, startOffsetDays: number) {
    return {
      id: ENROLLMENT_ID,
      userId: STUDENT.id,
      status: "ACTIVE",
      transferCount,
      batch: { id: BATCH_ID, programId: "program-1", startDate: new Date(Date.now() + startOffsetDays * DAY), firstClassAt: null },
    };
  }

  it("is not available while the refund window is open, or a second time", async () => {
    db.trainingEnrollment.findUnique.mockResolvedValue(enrollment(0, 2));
    await expect(transferEnrollment(STUDENT, { enrollmentId: ENROLLMENT_ID, targetBatchId: OTHER_BATCH_ID })).rejects.toThrow("still open");
    db.trainingEnrollment.findUnique.mockResolvedValue(enrollment(1, -2));
    await expect(transferEnrollment(STUDENT, { enrollmentId: ENROLLMENT_ID, targetBatchId: OTHER_BATCH_ID })).rejects.toThrow("already used");
  });

  it("moves to a later open batch of the same programme with a free seat", async () => {
    db.trainingEnrollment.findUnique.mockResolvedValueOnce(enrollment(0, -2)).mockResolvedValueOnce(null);
    db.trainingBatch.findUnique.mockResolvedValue(batch({ id: OTHER_BATCH_ID, startDate: new Date(Date.now() + 30 * DAY) }));
    db.trainingEnrollment.count.mockResolvedValue(5);
    const result = await transferEnrollment(STUDENT, { enrollmentId: ENROLLMENT_ID, targetBatchId: OTHER_BATCH_ID });
    expect(result.batchId).toBe(OTHER_BATCH_ID);
    expect(db.trainingEnrollment.update.mock.calls[0][0].data).toEqual({ batchId: OTHER_BATCH_ID, transferCount: { increment: 1 } });
  });

  it("refuses a batch of another programme", async () => {
    db.trainingEnrollment.findUnique.mockResolvedValue(enrollment(0, -2));
    db.trainingBatch.findUnique.mockResolvedValue(batch({ id: OTHER_BATCH_ID, programId: "program-2" }));
    await expect(transferEnrollment(STUDENT, { enrollmentId: ENROLLMENT_ID, targetBatchId: OTHER_BATCH_ID })).rejects.toBeInstanceOf(
      ValidationError
    );
  });
});

// -----------------------------------------------------------------------------
// Webhook route
// -----------------------------------------------------------------------------

describe("POST /api/webhooks/razorpay", () => {
  function webhook(body: string, headers: Record<string, string>) {
    return new NextRequest("http://localhost/api/webhooks/razorpay", { method: "POST", body, headers });
  }
  const capturedBody = JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: { id: "pay_XYZ", order_id: "order_ABC", amount: 499_900, status: "captured" } } },
  });

  it("rejects a bad signature", async () => {
    const res = await razorpayWebhook(webhook(capturedBody, { "x-razorpay-signature": "bad", "x-razorpay-event-id": "evt_1" }));
    expect(res.status).toBe(400);
    expect(db.trainingPayment.findUnique).not.toHaveBeenCalled();
  });

  it("answers 503 while payments are not configured", async () => {
    rp.getRazorpayConfig.mockReturnValue(null);
    const res = await razorpayWebhook(webhook(capturedBody, { "x-razorpay-signature": sign(capturedBody, WEBHOOK_SECRET) }));
    expect(res.status).toBe(503);
  });

  it("applies an event once", async () => {
    db.paymentWebhookEvent.findUnique.mockResolvedValue({ id: "evt_1" });
    const res = await razorpayWebhook(
      webhook(capturedBody, { "x-razorpay-signature": sign(capturedBody, WEBHOOK_SECRET), "x-razorpay-event-id": "evt_1" })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(db.trainingPayment.findUnique).not.toHaveBeenCalled();
  });

  it("records a captured payment, stores the event id and flushes the outbox", async () => {
    db.paymentWebhookEvent.findUnique.mockResolvedValue(null);
    db.paymentWebhookEvent.create.mockResolvedValue({});
    db.trainingPayment.findUnique.mockResolvedValue({
      id: "payment-1",
      enrollmentId: ENROLLMENT_ID,
      amountPaise: 499_900,
      status: "CAPTURED",
      enrollment: { id: ENROLLMENT_ID, status: "ACTIVE", receiptNo: "R-1", userId: STUDENT.id },
    });
    const res = await razorpayWebhook(
      webhook(capturedBody, { "x-razorpay-signature": sign(capturedBody, WEBHOOK_SECRET), "x-razorpay-event-id": "evt_2" })
    );
    expect(res.status).toBe(200);
    expect(db.paymentWebhookEvent.create).toHaveBeenCalledWith({ data: { id: "evt_2", event: "payment.captured" } });
    expect(outbox.scheduleOutboxFlush).toHaveBeenCalled();
  });

  it("acknowledges unknown orders and asks Razorpay to retry other failures", async () => {
    db.paymentWebhookEvent.findUnique.mockResolvedValue(null);
    db.paymentWebhookEvent.create.mockResolvedValue({});
    db.trainingPayment.findUnique.mockResolvedValue(null);
    const headers = { "x-razorpay-signature": sign(capturedBody, WEBHOOK_SECRET), "x-razorpay-event-id": "evt_3" };
    expect((await razorpayWebhook(webhook(capturedBody, headers))).status).toBe(200);

    db.trainingPayment.findUnique.mockRejectedValue(new Error("database down"));
    const retry = await razorpayWebhook(webhook(capturedBody, { ...headers, "x-razorpay-event-id": "evt_4" }));
    expect(retry.status).toBe(500);
    expect(db.paymentWebhookEvent.create).toHaveBeenCalledTimes(1);
  });
});

// -----------------------------------------------------------------------------
// Receipt PDF and emails
// -----------------------------------------------------------------------------

describe("payment receipt PDF", () => {
  it("renders a PDF with the receipt number and amounts", () => {
    const pdf = buildPaymentReceiptPdf({
      receiptNo: "GARA-RCPT-2026-000042",
      paidAt: new Date("2026-11-20T10:00:00Z"),
      timeZone: "Asia/Kolkata",
      companyName: "GARA INNOVATION PVT LTD",
      companyLines: ["Udyam Registration No.: UDYAM-UP-28-0244775"],
      studentName: "Asha Rao",
      studentEmail: "student@example.test",
      programTitle: "Full-Stack Web Development",
      batchName: "January 2027",
      listPrice: formatInr(499_900),
      discount: null,
      amountPaid: formatInr(499_900),
      paymentReference: "pay_XYZ",
      contactEmail: "contact@example.test",
    });
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("GARA-RCPT-2026-000042");
    expect(text).toContain("pay_XYZ");
    expect(text).toContain("Rs.");
  });
});

describe("training emails", () => {
  it("escapes values in the payment email", () => {
    const email = renderTrainingPaymentReceivedEmail({
      recipientName: "<b>Asha</b>",
      programTitle: "Full-Stack",
      batchName: "Jan",
      amount: "₹4,999",
      receiptNo: "GARA-RCPT-2026-000042",
      paidAt: "2026-11-20T10:00:00Z",
      refundWindowClosesAt: "2027-01-10T04:30:00Z",
    });
    expect(email.subject).toBe("[GARA Innovation] Payment received: Full-Stack");
    expect(email.html).toContain("&lt;b&gt;Asha&lt;/b&gt;");
    expect(email.html).not.toContain("<b>Asha</b>");
    expect(email.text).toContain("GARA-RCPT-2026-000042");
  });

  it("shows the reason only on a rejection and never an unknown outcome as success", () => {
    const rejected = renderTrainingRefundUpdateEmail({ outcome: "REJECTED", note: "Window closed", amount: "₹4,999" });
    expect(rejected.text).toContain("Reason: Window closed");
    const processed = renderTrainingRefundUpdateEmail({ outcome: "PROCESSED", note: "ignored", amount: "₹4,999" });
    expect(processed.text).not.toContain("ignored");
    expect(processed.subject).toContain("Refund Processed");
    const unknown = renderTrainingRefundUpdateEmail({ outcome: "SOMETHING", amount: "₹4,999" });
    expect(unknown.subject).toContain("Refund Delayed");
  });
});
