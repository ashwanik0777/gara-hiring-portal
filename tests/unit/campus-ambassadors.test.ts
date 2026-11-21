import { describe, it, expect, vi, beforeEach } from "vitest";

const { db, rx } = vi.hoisted(() => ({
  db: {
    campusAmbassador: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    trainingEnrollment: { findUnique: vi.fn() },
    ambassadorCommission: { create: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    ambassadorPayout: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    referralClickDaily: { upsert: vi.fn() },
    user: { findUnique: vi.fn(), updateMany: vi.fn() },
    notificationOutbox: { createMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  rx: { getRazorpayXAccountNumber: vi.fn(), createContact: vi.fn(), createUpiFundAccount: vi.fn(), createUpiPayout: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/infrastructure/payments/razorpayx", () => rx);

import { Role } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/errors";
import {
  buildReferralCode,
  commissionBucket,
  maskUpiId,
  normalizeReferralCode,
  payoutTdsPaise,
  referralDiscountPaise,
  REFERRAL_CODE_PATTERN,
} from "@/features/ambassadors/policy";
import { ambassadorApplicationSchema, normalizeIndianPhone } from "@/features/ambassadors/schemas";
import {
  attachReferralSignup,
  decideAmbassador,
  recordReferralClick,
  resolveReferralForStudent,
} from "@/features/ambassadors/services/ambassador-service";
import {
  createCommissionForEnrollment,
  payViaRazorpayX,
  recordManualPayout,
  recordPayoutUpdate,
  reverseCommission,
  reviewCommissions,
} from "@/features/ambassadors/services/commission-service";
import { renderAmbassadorStatusEmail } from "@/infrastructure/email/templates/ambassador-emails";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date("2027-02-01T10:00:00Z");
const ADMIN: AuthenticatedUser = { id: "admin-1", email: "a@example.test", name: "Admin", roles: [Role.ADMIN] };
const HR: AuthenticatedUser = { id: "hr-1", email: "h@example.test", name: "HR", roles: [Role.HR] };
const AMBASSADOR_ID = "11111111-1111-4111-8111-111111111111";
const ENROLLMENT_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  db.$queryRaw.mockResolvedValue([]);
  db.auditLog.create.mockResolvedValue({});
  db.notificationOutbox.createMany.mockResolvedValue({ count: 1 });
});

describe("ambassador policy", () => {
  it("builds readable, valid referral codes", () => {
    let n = 0;
    const code = buildReferralCode("Rahul Kumar", () => n++ % 31);
    expect(code).toMatch(REFERRAL_CODE_PATTERN);
    expect(code.startsWith("GARA-RAHU")).toBe(true);
    // Names without usable letters are padded from the alphabet.
    expect(buildReferralCode("Él 0", () => 0)).toMatch(REFERRAL_CODE_PATTERN);
    expect(normalizeReferralCode(" gara-rahu7k2 ")).toBe("GARA-RAHU7K2");
    expect(normalizeReferralCode("GARA-RAHU7K0")).toBeNull();
  });

  it("gives a 10% discount in whole rupees and never the whole fee", () => {
    expect(referralDiscountPaise(499_900)).toBe(49_900);
    expect(referralDiscountPaise(100, 100)).toBe(0);
    expect(referralDiscountPaise(499_900, 0)).toBe(0);
  });

  it("computes TDS only once the rule is decided", () => {
    expect(payoutTdsPaise(10_000, null)).toBeNull();
    expect(payoutTdsPaise(10_000, 5)).toBe(500);
  });

  it("masks UPI IDs and sorts commissions into buckets", () => {
    expect(maskUpiId("rahul.kumar@okaxis")).toBe("ra••••••@okaxis");
    const base = { status: "PENDING", payableAt: new Date(NOW.getTime() - HOUR), payoutId: null, enrollmentStatus: "ACTIVE" };
    // Payment is at GARA's discretion: an earned commission waits for the administrator's review.
    expect(commissionBucket(base, NOW)).toBe("review");
    expect(commissionBucket({ ...base, status: "APPROVED" }, NOW)).toBe("approved");
    expect(commissionBucket({ ...base, status: "DECLINED" }, NOW)).toBe("declined");
    expect(commissionBucket({ ...base, payableAt: new Date(NOW.getTime() + HOUR) }, NOW)).toBe("pending");
    expect(commissionBucket({ ...base, status: "APPROVED", payableAt: new Date(NOW.getTime() + HOUR) }, NOW)).toBe("pending");
    expect(commissionBucket({ ...base, enrollmentStatus: "REFUND_REQUESTED" }, NOW)).toBe("pending");
    expect(commissionBucket({ ...base, status: "APPROVED", payoutId: "p1" }, NOW)).toBe("processing");
    expect(commissionBucket({ ...base, status: "PAID", payoutId: "p1" }, NOW)).toBe("paid");
    expect(commissionBucket({ ...base, status: "REVERSED" }, NOW)).toBe("reversed");
  });

  it("validates Indian mobile numbers and needs consent", () => {
    expect(normalizeIndianPhone("+91 98765 43210")).toBe("9876543210");
    expect(normalizeIndianPhone("12345")).toBeNull();
    const base = { phone: "9876543210", collegeName: "ABC Institute", yearOfStudy: "2", motivation: "I love helping my juniors learn to code." };
    expect(ambassadorApplicationSchema.safeParse({ ...base, consent: true }).success).toBe(true);
    expect(ambassadorApplicationSchema.safeParse({ ...base, consent: false }).success).toBe(false);
  });
});

describe("referrals", () => {
  it("refuses unknown codes, inactive ambassadors and self-referral", async () => {
    db.campusAmbassador.findUnique.mockResolvedValue(null);
    await expect(resolveReferralForStudent(db as never, "GARA-RAHU7K2", "student-1")).rejects.toBeInstanceOf(ValidationError);
    db.campusAmbassador.findUnique.mockResolvedValue({ id: AMBASSADOR_ID, userId: "amb-user", status: "DEACTIVATED" });
    await expect(resolveReferralForStudent(db as never, "GARA-RAHU7K2", "student-1")).rejects.toBeInstanceOf(ValidationError);
    db.campusAmbassador.findUnique.mockResolvedValue({ id: AMBASSADOR_ID, userId: "student-1", status: "APPROVED" });
    await expect(resolveReferralForStudent(db as never, "GARA-RAHU7K2", "student-1")).rejects.toThrow("own referral code");
    db.campusAmbassador.findUnique.mockResolvedValue({ id: AMBASSADOR_ID, userId: "amb-user", status: "APPROVED" });
    await expect(resolveReferralForStudent(db as never, "gara-rahu7k2", "student-1")).resolves.toEqual({ ambassadorId: AMBASSADOR_ID, code: "GARA-RAHU7K2" });
  });

  it("counts clicks per day for active ambassadors only", async () => {
    expect(await recordReferralClick("not-a-code", NOW)).toBeNull();
    db.campusAmbassador.findUnique.mockResolvedValue({ id: AMBASSADOR_ID, status: "APPROVED" });
    expect(await recordReferralClick("GARA-RAHU7K2", NOW)).toBe("GARA-RAHU7K2");
    expect(db.referralClickDaily.upsert.mock.calls[0][0]).toMatchObject({
      where: { ambassadorId_day: { ambassadorId: AMBASSADOR_ID, day: "2027-02-01" } },
      update: { clicks: { increment: 1 } },
    });
  });

  it("attributes only new, unattributed accounts inside the window", async () => {
    db.campusAmbassador.findUnique.mockResolvedValue({ id: AMBASSADOR_ID, userId: "amb-user", status: "APPROVED" });
    db.user.findUnique.mockResolvedValue({ referredByAmbassadorId: null, createdAt: new Date(NOW.getTime() - 40 * DAY) });
    await attachReferralSignup("student-1", "GARA-RAHU7K2", NOW);
    expect(db.user.updateMany).not.toHaveBeenCalled();
    db.user.findUnique.mockResolvedValue({ referredByAmbassadorId: null, createdAt: new Date(NOW.getTime() - DAY) });
    await attachReferralSignup("student-1", "GARA-RAHU7K2", NOW);
    expect(db.user.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "student-1", referredByAmbassadorId: null }, data: { referredByAmbassadorId: AMBASSADOR_ID } });
  });
});

describe("commission ledger", () => {
  const enrollment = {
    userId: "student-1",
    referralCode: "GARA-RAHU7K2",
    amountPaidPaise: 449_910,
    reattemptOfId: null,
    commission: null,
    batch: { startDate: new Date("2027-01-10T00:00:00Z"), firstClassAt: new Date("2027-01-10T13:30:00Z") },
  };

  it("records ₹100 payable 24 hours after the first class", async () => {
    db.trainingEnrollment.findUnique.mockResolvedValue(enrollment);
    db.campusAmbassador.findUnique.mockResolvedValue({ id: AMBASSADOR_ID, userId: "amb-user", status: "APPROVED" });
    await createCommissionForEnrollment(db as never, ENROLLMENT_ID);
    expect(db.ambassadorCommission.create.mock.calls[0][0].data).toEqual({
      ambassadorId: AMBASSADOR_ID,
      enrollmentId: ENROLLMENT_ID,
      amountPaise: 10_000,
      payableAt: new Date("2027-01-11T13:30:00Z"),
    });
  });

  it("records nothing for self-referral, inactive ambassadors or free re-attempts", async () => {
    db.trainingEnrollment.findUnique.mockResolvedValue(enrollment);
    db.campusAmbassador.findUnique.mockResolvedValue({ id: AMBASSADOR_ID, userId: "student-1", status: "APPROVED" });
    await createCommissionForEnrollment(db as never, ENROLLMENT_ID);
    db.campusAmbassador.findUnique.mockResolvedValue({ id: AMBASSADOR_ID, userId: "amb-user", status: "DEACTIVATED" });
    await createCommissionForEnrollment(db as never, ENROLLMENT_ID);
    db.trainingEnrollment.findUnique.mockResolvedValue({ ...enrollment, reattemptOfId: "x", amountPaidPaise: 0 });
    await createCommissionForEnrollment(db as never, ENROLLMENT_ID);
    expect(db.ambassadorCommission.create).not.toHaveBeenCalled();
  });

  it("reverses an unpaid commission when the enrollment is refunded", async () => {
    await reverseCommission(db as never, ENROLLMENT_ID, NOW);
    expect(db.ambassadorCommission.updateMany.mock.calls[0][0]).toEqual({
      where: { enrollmentId: ENROLLMENT_ID, status: { in: ["PENDING", "APPROVED", "DECLINED"] }, payoutId: null },
      data: { status: "REVERSED", reversedAt: NOW },
    });
  });
});

describe("ambassador decisions", () => {
  const pending = { id: AMBASSADOR_ID, status: "PENDING", collegeId: "college-1", referralCode: null, approvedAt: null, user: { name: "Rahul Kumar", email: "r@example.test" } };

  it("is for administrators only", async () => {
    await expect(decideAmbassador(HR, { ambassadorId: AMBASSADOR_ID, decision: "APPROVE", role: "ASSOCIATE" }, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("approves with a referral code and a 30-day trial", async () => {
    db.campusAmbassador.findUnique.mockResolvedValue(pending);
    db.campusAmbassador.update.mockResolvedValue({ referralCode: "GARA-RAHU7K2", status: "APPROVED" });
    await decideAmbassador(ADMIN, { ambassadorId: AMBASSADOR_ID, decision: "APPROVE", role: "ASSOCIATE" }, NOW);
    const data = db.campusAmbassador.update.mock.calls[0][0].data;
    expect(data.status).toBe("APPROVED");
    expect(data.referralCode).toMatch(/^GARA-RAHU[A-Z2-9]{3}$/);
    expect(data.trialEndsAt).toEqual(new Date(NOW.getTime() + 30 * DAY));
    expect(db.notificationOutbox.createMany.mock.calls[0][0].data[0].templateName).toBe("AMBASSADOR_STATUS");
  });

  it("allows one Lead per college and needs a reason to reject", async () => {
    db.campusAmbassador.findUnique.mockResolvedValue(pending);
    db.campusAmbassador.findFirst.mockResolvedValue({ id: "other-lead" });
    await expect(decideAmbassador(ADMIN, { ambassadorId: AMBASSADOR_ID, decision: "APPROVE", role: "LEAD" }, NOW)).rejects.toThrow("already has a Lead");
    await expect(decideAmbassador(ADMIN, { ambassadorId: AMBASSADOR_ID, decision: "REJECT" }, NOW)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("payouts", () => {
  it("records a bank payout with UTR for all payable commissions", async () => {
    db.ambassadorCommission.findMany.mockResolvedValue([
      { id: "c1", amountPaise: 10_000 },
      { id: "c2", amountPaise: 10_000 },
    ]);
    db.ambassadorPayout.create.mockResolvedValue({ id: "payout-1" });
    db.ambassadorPayout.findUnique.mockResolvedValue({ grossPaise: 20_000, tdsPaise: 1_000, netPaise: 19_000, utr: "UTR12345678", ambassador: { user: { name: "R", email: "r@example.test" } } });
    await recordManualPayout(ADMIN, { ambassadorId: AMBASSADOR_ID, utr: "utr12345678", tdsRupees: "10" }, NOW);
    expect(db.ambassadorPayout.create.mock.calls[0][0].data).toMatchObject({ grossPaise: 20_000, tdsPaise: 1_000, netPaise: 19_000, method: "MANUAL", status: "PAID", utr: "UTR12345678" });
    expect(db.ambassadorCommission.updateMany.mock.calls[0][0]).toEqual({ where: { id: { in: ["c1", "c2"] } }, data: { status: "PAID", payoutId: "payout-1" } });
  });

  it("pays only commissions an administrator approved", async () => {
    db.ambassadorCommission.findMany.mockResolvedValue([]);
    await expect(recordManualPayout(ADMIN, { ambassadorId: AMBASSADOR_ID, utr: "UTR12345678" }, NOW)).rejects.toBeInstanceOf(ConflictError);
    expect(db.ambassadorCommission.findMany.mock.calls[0][0].where).toMatchObject({ status: "APPROVED", payoutId: null, ambassadorId: AMBASSADOR_ID });
  });

  it("refuses an empty payout", async () => {
    db.ambassadorCommission.findMany.mockResolvedValue([]);
    await expect(recordManualPayout(ADMIN, { ambassadorId: AMBASSADOR_ID, utr: "UTR12345678" }, NOW)).rejects.toBeInstanceOf(ConflictError);
  });

  it("keeps RazorpayX payouts off until configured and the TDS rule is decided", async () => {
    rx.getRazorpayXAccountNumber.mockReturnValue(null);
    await expect(payViaRazorpayX(ADMIN, AMBASSADOR_ID, NOW)).rejects.toThrow("not configured");
    rx.getRazorpayXAccountNumber.mockReturnValue("1234567890");
    await expect(payViaRazorpayX(ADMIN, AMBASSADOR_ID, NOW)).rejects.toThrow("TDS rule");
    expect(rx.createUpiPayout).not.toHaveBeenCalled();
  });

  it("marks a processed payout paid and releases a failed one", async () => {
    db.ambassadorPayout.findUnique.mockResolvedValueOnce({ id: "payout-1", status: "PROCESSING" }).mockResolvedValueOnce(null);
    await recordPayoutUpdate("pout_1", "processed", "UTR999", null);
    expect(db.ambassadorCommission.updateMany.mock.calls[0][0]).toEqual({ where: { payoutId: "payout-1" }, data: { status: "PAID" } });

    vi.clearAllMocks();
    db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
    db.ambassadorPayout.findUnique.mockResolvedValue({ id: "payout-1", status: "PROCESSING" });
    await recordPayoutUpdate("pout_1", "failed", null, "Invalid VPA");
    // The commissions stay approved and return to the "ready to pay" list.
    expect(db.ambassadorCommission.updateMany.mock.calls[0][0]).toEqual({ where: { payoutId: "payout-1" }, data: { payoutId: null, status: "APPROVED" } });
  });

  it("does not pay a failed payout again when a late success arrives", async () => {
    db.ambassadorPayout.findUnique.mockResolvedValue({ id: "payout-1", status: "FAILED" });
    await recordPayoutUpdate("pout_1", "processed", "UTR999", null);
    expect(db.ambassadorPayout.update).not.toHaveBeenCalled();
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe("AMBASSADOR_PAYOUT_NEEDS_RECONCILIATION");
  });
});

describe("commission review (payment at GARA's discretion)", () => {
  const C1 = "33333333-3333-4333-8333-333333333331";
  const C2 = "33333333-3333-4333-8333-333333333332";

  it("is for administrators only", async () => {
    const hr: AuthenticatedUser = { ...ADMIN, id: "hr-1", roles: [Role.HR] };
    await expect(reviewCommissions(hr, { ambassadorId: AMBASSADOR_ID, commissionIds: [C1], decision: "APPROVE" }, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("approves chosen commissions, records who and when, and audits it", async () => {
    db.ambassadorCommission.findMany.mockResolvedValue([
      { id: C1, amountPaise: 10_000 },
      { id: C2, amountPaise: 10_000 },
    ]);
    const result = await reviewCommissions(ADMIN, { ambassadorId: AMBASSADOR_ID, commissionIds: [C1, C2, C1], decision: "APPROVE" }, NOW);
    expect(result).toEqual({ count: 2, amountPaise: 20_000, status: "APPROVED" });
    const where = db.ambassadorCommission.findMany.mock.calls[0][0].where;
    // Only unpaid commissions past the refund window, not being refunded, can be decided.
    expect(where).toMatchObject({ ambassadorId: AMBASSADOR_ID, payoutId: null, status: { in: ["PENDING", "APPROVED", "DECLINED"] }, payableAt: { lte: NOW } });
    expect(where.enrollment).toEqual({ status: { notIn: ["REFUND_REQUESTED", "REFUNDED"] } });
    expect(db.ambassadorCommission.updateMany.mock.calls[0][0]).toEqual({
      where: { id: { in: [C1, C2] } },
      data: { status: "APPROVED", reviewedAt: NOW, reviewedById: ADMIN.id, reviewNote: null },
    });
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: "AMBASSADOR_COMMISSIONS_APPROVED", resourceId: AMBASSADOR_ID });
  });

  it("needs a reason to decline and stores it", async () => {
    await expect(reviewCommissions(ADMIN, { ambassadorId: AMBASSADOR_ID, commissionIds: [C1], decision: "DECLINE", note: "no" }, NOW)).rejects.toBeInstanceOf(ValidationError);
    db.ambassadorCommission.findMany.mockResolvedValue([{ id: C1, amountPaise: 10_000 }]);
    await reviewCommissions(ADMIN, { ambassadorId: AMBASSADOR_ID, commissionIds: [C1], decision: "DECLINE", note: "Referrals were not genuine" }, NOW);
    expect(db.ambassadorCommission.updateMany.mock.calls[0][0].data).toMatchObject({ status: "DECLINED", reviewNote: "Referrals were not genuine" });
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe("AMBASSADOR_COMMISSIONS_DECLINED");
  });

  it("refuses commissions that cannot be decided (paid, refunded or not ready)", async () => {
    db.ambassadorCommission.findMany.mockResolvedValue([{ id: C1, amountPaise: 10_000 }]);
    await expect(reviewCommissions(ADMIN, { ambassadorId: AMBASSADOR_ID, commissionIds: [C1, C2], decision: "APPROVE" }, NOW)).rejects.toBeInstanceOf(ConflictError);
    expect(db.ambassadorCommission.updateMany).not.toHaveBeenCalled();
  });
});

describe("ambassador emails", () => {
  it("shows the referral link on approval and escapes values", () => {
    const email = renderAmbassadorStatusEmail({ recipientName: "<i>R</i>", status: "APPROVED", role: "LEAD", referralCode: "GARA-RAHU7K2", referralLink: "https://example.test/?ref=GARA-RAHU7K2" });
    expect(email.text).toContain("GARA-RAHU7K2");
    expect(email.text).toContain("Lead");
    expect(email.html).not.toContain("<i>R</i>");
  });
});
