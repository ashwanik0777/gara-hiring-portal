import { createHmac } from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";

/*
 * Nobody gets an Industrial Training seat, learning access or a certificate without a payment
 * that Razorpay confirms for the exact order and amount (product owner, 2026-11-20). Each test
 * is one way someone could try to get in without paying.
 */

const { db, rp } = vi.hoisted(() => ({
  db: {
    user: { findUnique: vi.fn() },
    trainingBatch: { findUnique: vi.fn() },
    trainingEnrollment: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    trainingPayment: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    trainingAssignment: { findUnique: vi.fn() },
    trainingSubmission: { findUnique: vi.fn(), upsert: vi.fn() },
    trainingDemoSlot: { findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    trainingBatchMentor: { findUnique: vi.fn() },
    certificatePrintOrder: { findUnique: vi.fn() },
    campusAmbassador: { findUnique: vi.fn() },
    ambassadorCommission: { create: vi.fn() },
    paymentWebhookEvent: { findUnique: vi.fn(), create: vi.fn() },
    notificationOutbox: { createMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  rp: { getRazorpayConfig: vi.fn(), createOrder: vi.fn(), fetchPayment: vi.fn(), capturePayment: vi.fn(), createRefund: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/infrastructure/email/outbox-dispatch", () => ({ scheduleOutboxFlush: vi.fn() }));
vi.mock("@/infrastructure/payments/razorpay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/infrastructure/payments/razorpay")>()),
  ...rp,
}));

import { Role } from "@prisma/client";
import { NextRequest } from "next/server";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { confirmCheckout, recordCapturedPayment, startCheckout } from "@/features/training/services/checkout-service";
import { getLearningArea, startReattempt, submitAssignment } from "@/features/training/services/learning-service";
import { decideTrainingResult } from "@/features/training/services/result-service";
import { getReceiptPdf } from "@/features/training/services/enrollment-service";
import { referralDiscountPaise } from "@/features/ambassadors/policy";
import { POST as razorpayWebhook } from "@/app/api/webhooks/razorpay/route";

const KEY_SECRET = "key_secret_for_tests";
const WEBHOOK_SECRET = "webhook_secret_for_tests";
const STUDENT: AuthenticatedUser = { id: "student-1", email: "s@example.test", name: "Asha", roles: [Role.CANDIDATE] };
const ADMIN: AuthenticatedUser = { id: "admin-1", email: "a@example.test", name: "Admin", roles: [Role.ADMIN] };
const ENROLLMENT_ID = "22222222-2222-4222-8222-222222222222";
const BATCH_ID = "11111111-1111-4111-8111-111111111111";
const sign = (value: string, secret: string) => createHmac("sha256", secret).update(value).digest("hex");

const pendingOrder = (overrides: Record<string, unknown> = {}) => ({
  id: "payment-1",
  enrollmentId: ENROLLMENT_ID,
  amountPaise: 499_900,
  status: "CREATED",
  listPricePaise: 499_900,
  discountPaise: 0,
  referralCode: null,
  enrollment: { id: ENROLLMENT_ID, userId: STUDENT.id, status: "PENDING_PAYMENT", receiptNo: null },
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  db.$queryRaw.mockImplementation((strings: TemplateStringsArray) =>
    Promise.resolve(strings.join("?").includes("nextval") ? [{ value: BigInt(1) }] : [])
  );
  db.auditLog.create.mockResolvedValue({});
  db.notificationOutbox.createMany.mockResolvedValue({ count: 1 });
  rp.getRazorpayConfig.mockReturnValue({ keyId: "rzp_test_x", keySecret: KEY_SECRET, webhookSecret: WEBHOOK_SECRET });
});

describe("starting checkout never enrols", () => {
  it("creates only a pending, unpaid enrollment with a 15-minute hold", async () => {
    db.user.findUnique.mockResolvedValue({ name: "Asha", email: "s@example.test", emailVerified: true });
    db.trainingBatch.findUnique.mockResolvedValue({
      id: BATCH_ID,
      name: "Jan",
      status: "UPCOMING",
      startDate: new Date(Date.now() + 10 * 86_400_000),
      enrollmentDeadline: null,
      seats: 30,
      program: { title: "FS", feePaise: 499_900, status: "PUBLISHED" },
    });
    db.trainingEnrollment.findUnique.mockResolvedValue(null);
    db.trainingEnrollment.count.mockResolvedValue(0);
    db.trainingEnrollment.create.mockResolvedValue({ id: ENROLLMENT_ID });
    rp.createOrder.mockResolvedValue({ id: "order_A", amount: 499_900, currency: "INR" });
    await startCheckout(STUDENT, { batchId: BATCH_ID, consent: true });
    expect(db.trainingEnrollment.create.mock.calls[0][0].data).toMatchObject({ status: "PENDING_PAYMENT", amountPaidPaise: 0 });
    expect(db.trainingEnrollment.update).not.toHaveBeenCalled();
  });

  it("a referral code can never make training free", () => {
    expect(referralDiscountPaise(100, 100)).toBe(0);
    expect(referralDiscountPaise(499_900, 100)).toBeLessThan(499_900);
  });
});

describe("the browser confirmation cannot be faked", () => {
  const confirm = (overrides: Partial<{ orderId: string; paymentId: string; signature: string }> = {}) => {
    const orderId = overrides.orderId ?? "order_A";
    const paymentId = overrides.paymentId ?? "pay_A";
    return confirmCheckout(STUDENT, { orderId, paymentId, signature: overrides.signature ?? sign(`${orderId}|${paymentId}`, KEY_SECRET) });
  };

  beforeEach(() => {
    db.trainingPayment.findUnique.mockResolvedValue(pendingOrder());
  });

  it("refuses a made-up signature without asking Razorpay", async () => {
    await expect(confirm({ signature: sign("order_A|pay_A", "guessed-secret") })).rejects.toBeInstanceOf(ValidationError);
    expect(rp.fetchPayment).not.toHaveBeenCalled();
    expect(db.trainingEnrollment.update).not.toHaveBeenCalled();
  });

  it("refuses a signature of another order (reusing someone else's payment)", async () => {
    await expect(confirm({ signature: sign("order_B|pay_A", KEY_SECRET) })).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses a payment Razorpay has not completed", async () => {
    for (const status of ["created", "failed", "refunded"] as const) {
      rp.fetchPayment.mockResolvedValue({ id: "pay_A", order_id: "order_A", amount: 499_900, currency: "INR", status });
      await expect(confirm()).rejects.toBeInstanceOf(ConflictError);
    }
    expect(db.trainingEnrollment.update).not.toHaveBeenCalled();
  });

  it("refuses a payment of another order, a smaller amount or another currency", async () => {
    for (const remote of [
      { order_id: "order_OTHER", amount: 499_900, currency: "INR" },
      { order_id: "order_A", amount: 100, currency: "INR" },
      { order_id: "order_A", amount: 499_900, currency: "USD" },
    ]) {
      rp.fetchPayment.mockResolvedValue({ id: "pay_A", status: "captured", ...remote });
      await expect(confirm()).rejects.toBeInstanceOf(ValidationError);
    }
    expect(db.trainingEnrollment.update).not.toHaveBeenCalled();
  });

  it("refuses to confirm another student's order", async () => {
    db.trainingPayment.findUnique.mockResolvedValue(pendingOrder({ enrollment: { id: ENROLLMENT_ID, userId: "someone-else", status: "PENDING_PAYMENT", receiptNo: null } }));
    await expect(confirm()).rejects.toBeInstanceOf(NotFoundError);
  });

  it("does not enrol when the capture of an authorized payment fails", async () => {
    rp.fetchPayment.mockResolvedValue({ id: "pay_A", order_id: "order_A", amount: 499_900, currency: "INR", status: "authorized" });
    rp.capturePayment.mockRejectedValue(new Error("capture refused"));
    await expect(confirm()).rejects.toThrow();
    expect(db.trainingEnrollment.update).not.toHaveBeenCalled();
  });
});

describe("the webhook cannot be faked", () => {
  const post = (body: string, signature: string) =>
    razorpayWebhook(new NextRequest("http://localhost/api/webhooks/razorpay", { method: "POST", body, headers: { "x-razorpay-signature": signature } }));
  const captured = (amount: number) =>
    JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_A", order_id: "order_A", amount, status: "captured" } } } });

  it("refuses unsigned and wrongly signed events", async () => {
    expect((await post(captured(499_900), "")).status).toBe(400);
    expect((await post(captured(499_900), sign(captured(499_900), "guessed-secret"))).status).toBe(400);
    expect(db.trainingPayment.findUnique).not.toHaveBeenCalled();
  });

  it("does not enrol on a captured amount that differs from the order", async () => {
    db.trainingPayment.findUnique.mockResolvedValue(pendingOrder());
    const response = await post(captured(100), sign(captured(100), WEBHOOK_SECRET));
    expect(response.status).toBe(500);
    expect(db.trainingEnrollment.update).not.toHaveBeenCalled();
  });
});

describe("recording a payment", () => {
  it("never re-activates a refunded enrollment (a late or second payment is flagged for staff)", async () => {
    db.trainingPayment.findUnique.mockResolvedValue(pendingOrder({ enrollment: { id: ENROLLMENT_ID, userId: STUDENT.id, status: "REFUNDED", receiptNo: "R-1" } }));
    const result = await recordCapturedPayment({ orderId: "order_A", paymentId: "pay_A", amountPaise: 499_900, source: "webhook" });
    expect(result.duplicate).toBe(true);
    expect(db.trainingEnrollment.update).not.toHaveBeenCalled();
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe("TRAINING_DUPLICATE_PAYMENT");
  });

  it("takes price, discount and referral from the order that was actually paid", async () => {
    db.trainingPayment.findUnique.mockResolvedValue(pendingOrder({ amountPaise: 449_900, discountPaise: 50_000, referralCode: "GARA-RAHU7K2" }));
    db.trainingEnrollment.findUnique.mockResolvedValue(null);
    await recordCapturedPayment({ orderId: "order_A", paymentId: "pay_A", amountPaise: 449_900, source: "webhook" });
    expect(db.trainingEnrollment.update.mock.calls[0][0].data).toMatchObject({
      status: "ACTIVE",
      amountPaidPaise: 449_900,
      listPricePaise: 499_900,
      discountPaise: 50_000,
      referralCode: "GARA-RAHU7K2",
    });
  });
});

describe("an unpaid enrollment gets nothing", () => {
  it("has no learning area", async () => {
    db.trainingEnrollment.findUnique.mockResolvedValue({ id: ENROLLMENT_ID, userId: STUDENT.id, status: "PENDING_PAYMENT", batch: {} });
    await expect(getLearningArea(STUDENT, ENROLLMENT_ID, new Date())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("cannot submit work", async () => {
    db.trainingEnrollment.findUnique.mockResolvedValue({ id: ENROLLMENT_ID, userId: STUDENT.id, status: "PENDING_PAYMENT", batchId: BATCH_ID, batch: { id: BATCH_ID, status: "UPCOMING", endDate: null, programId: "p" } });
    await expect(
      submitAssignment(STUDENT, { enrollmentId: ENROLLMENT_ID, assignmentId: BATCH_ID, repoUrl: "https://github.com/x/y" }, new Date())
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("cannot be passed or given a certificate", async () => {
    db.trainingEnrollment.findUnique.mockImplementation((args: { select?: { batchId?: boolean } }) =>
      Promise.resolve(args.select?.batchId ? { batchId: BATCH_ID } : { id: ENROLLMENT_ID, status: "PENDING_PAYMENT" })
    );
    await expect(
      decideTrainingResult(ADMIN, { enrollmentId: ENROLLMENT_ID, result: "PASS", signatoryName: "R", signatoryTitle: "Director" }, new Date())
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("cannot start a free re-attempt", async () => {
    db.trainingEnrollment.findUnique.mockResolvedValue({ id: ENROLLMENT_ID, userId: STUDENT.id, status: "PENDING_PAYMENT", reattempt: null, reattemptOfId: null, batch: { id: BATCH_ID, programId: "p" } });
    await expect(startReattempt(STUDENT, { enrollmentId: ENROLLMENT_ID, targetBatchId: BATCH_ID }, new Date())).rejects.toThrow("only after a fail");
  });

  it("has no payment receipt", async () => {
    db.trainingEnrollment.findUnique.mockResolvedValue({ userId: STUDENT.id, receiptNo: null, paidAt: null, payments: [], user: {}, batch: {} });
    await expect(getReceiptPdf(ENROLLMENT_ID, { id: STUDENT.id, roles: [Role.CANDIDATE] })).rejects.toBeInstanceOf(ConflictError);
  });
});
