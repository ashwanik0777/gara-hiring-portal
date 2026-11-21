import { describe, it, expect, vi, beforeEach } from "vitest";

const { db, rp, settings } = vi.hoisted(() => ({
  db: {
    user: { findUnique: vi.fn() },
    certificate: { findUnique: vi.fn() },
    candidateProfile: { findUnique: vi.fn() },
    certificatePrintOrder: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    printSettings: { findUnique: vi.fn(), upsert: vi.fn() },
    notificationOutbox: { createMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  rp: { getRazorpayConfig: vi.fn(), createOrder: vi.fn(), fetchPayment: vi.fn(), capturePayment: vi.fn() },
  /** The saved print_settings row (null: never saved). */
  settings: { row: null as Record<string, unknown> | null },
}));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/infrastructure/payments/razorpay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/infrastructure/payments/razorpay")>()),
  ...rp,
}));

/** The owner's settings of 2026-11-21. */
const OWNER_SETTINGS = {
  orderingOpen: true,
  collegeBulkPricePaise: 9_900,
  courierNcrPricePaise: 14_900,
  courierOutsidePricePaise: 17_900,
  collegeBulkDelivery: "7–12 working days",
  courierNcrDelivery: "5–8 working days",
  courierOutsideDelivery: "7–12 working days",
  ncrPinPrefixes: ["110", "201", "122", "121"],
  courierPartner: null as string | null,
};

import { Role } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { advancePrintOrder, recordPrintPaymentCaptured, startPrintCheckout } from "@/features/print-orders/services/print-order-service";
import { EMPTY_PRINT_SETTINGS, getPrintOffer, toPrintOffer, updatePrintSettings } from "@/features/print-orders/services/print-settings-service";
import { courierPriceFor, courierPriceRange, parsePinPrefixes, zoneForPincode } from "@/features/print-orders/pricing";
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
  settings.row = { ...OWNER_SETTINGS };
  db.printSettings.findUnique.mockImplementation(() => Promise.resolve(settings.row));
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  db.$queryRaw.mockImplementation((strings: TemplateStringsArray) => Promise.resolve(strings.join("?").includes("nextval") ? [{ value: BigInt(7) }] : []));
  db.notificationOutbox.createMany.mockResolvedValue({ count: 1 });
  db.auditLog.create.mockResolvedValue({});
  rp.getRazorpayConfig.mockReturnValue({ keyId: "rzp_test_x", keySecret: "s", webhookSecret: "w" });
  db.user.findUnique.mockResolvedValue({ name: "Asha", email: "s@example.test", emailVerified: true });
  db.certificate.findUnique.mockResolvedValue({ id: CERTIFICATE_ID, status: "ACTIVE", type: "TRAINING_COMPLETION", trainingEnrollment: { userId: STUDENT.id } });
  db.candidateProfile.findUnique.mockResolvedValue({ college: { name: "ABC Institute" } });
  rp.createOrder.mockImplementation(({ amountPaise }: { amountPaise: number }) => Promise.resolve({ id: "order_P1", amount: amountPaise, currency: "INR", status: "created" }));
});

describe("print zones", () => {
  it("decides NCR from the configured PIN code beginnings", () => {
    const prefixes = OWNER_SETTINGS.ncrPinPrefixes;
    expect(zoneForPincode("110001", prefixes)).toBe("NCR"); // Delhi
    expect(zoneForPincode("201301", prefixes)).toBe("NCR"); // Noida
    expect(zoneForPincode("122002", prefixes)).toBe("NCR"); // Gurugram
    expect(zoneForPincode("121001", prefixes)).toBe("NCR"); // Faridabad
    expect(zoneForPincode("560038", prefixes)).toBe("OUTSIDE_NCR"); // Bengaluru
    expect(zoneForPincode("250001", prefixes)).toBe("OUTSIDE_NCR"); // Meerut is not in the owner's list
    expect(zoneForPincode("110001", [])).toBe("OUTSIDE_NCR");
  });

  it("parses typed PIN code beginnings", () => {
    expect(parsePinPrefixes(" 110, 201 122;121,110 ")).toEqual(["110", "201", "122", "121"]);
    expect(parsePinPrefixes("")).toEqual([]);
  });
});

describe("print offer", () => {
  it("prices the owner's options: ₹99 bulk, ₹149 within NCR, ₹179 outside", () => {
    const offer = toPrintOffer({ ...OWNER_SETTINGS });
    expect(offer.open).toBe(true);
    expect(offer.collegeBulk).toEqual({ pricePaise: 9_900, expectedDelivery: "7–12 working days" });
    expect(courierPriceFor(offer, "201301")).toEqual({ zone: "NCR", price: { pricePaise: 14_900, expectedDelivery: "5–8 working days" } });
    expect(courierPriceFor(offer, "560038")).toEqual({ zone: "OUTSIDE_NCR", price: { pricePaise: 17_900, expectedDelivery: "7–12 working days" } });
    expect(courierPriceRange(offer)).toEqual({ min: 14_900, max: 17_900 });
  });

  it("is closed until saved, while paused, and without any price", async () => {
    settings.row = null;
    expect((await getPrintOffer()).open).toBe(false);
    expect(toPrintOffer(EMPTY_PRINT_SETTINGS).open).toBe(false);
    expect(toPrintOffer({ ...OWNER_SETTINGS, orderingOpen: false }).open).toBe(false);
    expect(toPrintOffer({ ...OWNER_SETTINGS, collegeBulkPricePaise: null, courierNcrPricePaise: null, courierOutsidePricePaise: null }).open).toBe(false);
  });

  it("has no NCR price without NCR PIN codes", () => {
    const offer = toPrintOffer({ ...OWNER_SETTINGS, ncrPinPrefixes: [] });
    expect(offer.courierNcr).toBeNull();
    expect(courierPriceFor(offer, "110001").price?.pricePaise).toBe(17_900);
  });
});

describe("startPrintCheckout", () => {
  it("refuses a closed option, another student's certificate and a non-training certificate", async () => {
    settings.row = { ...OWNER_SETTINGS, collegeBulkPricePaise: null };
    await expect(startPrintCheckout(STUDENT, { ...courier, deliveryType: "COLLEGE_BULK" })).rejects.toBeInstanceOf(ConflictError);
    settings.row = { ...OWNER_SETTINGS };
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
    db.candidateProfile.findUnique.mockResolvedValue({ college: null });
    await expect(startPrintCheckout(STUDENT, { ...courier, deliveryType: "COLLEGE_BULK" })).rejects.toThrow("Add your college");
  });

  it("charges the NCR price for an NCR PIN code and keeps the zone and promised delivery time", async () => {
    const session = await startPrintCheckout(STUDENT, courier);
    expect(session).toMatchObject({ orderId: "order_P1", amountPaise: 14_900 });
    expect(rp.createOrder.mock.calls[0][0]).toMatchObject({ amountPaise: 14_900 });
    expect(db.certificatePrintOrder.create.mock.calls[0][0].data).toMatchObject({
      deliveryType: "COURIER",
      amountPaise: 14_900,
      pincode: "201301",
      collegeName: null,
      deliveryZone: "NCR",
      expectedDelivery: "5–8 working days",
      razorpayOrderId: "order_P1",
    });
  });

  it("charges the outside-NCR price elsewhere, whatever the browser sends", async () => {
    const session = await startPrintCheckout(STUDENT, { ...courier, city: "Bengaluru", state: "Karnataka", pincode: "560038", amountPaise: 100, deliveryZone: "NCR" });
    expect(session.amountPaise).toBe(17_900);
    expect(rp.createOrder.mock.calls[0][0]).toMatchObject({ amountPaise: 17_900 });
    expect(db.certificatePrintOrder.create.mock.calls[0][0].data).toMatchObject({ amountPaise: 17_900, deliveryZone: "OUTSIDE_NCR", expectedDelivery: "7–12 working days" });
  });

  it("charges the bulk price through the college, with no zone", async () => {
    const session = await startPrintCheckout(STUDENT, { certificateId: CERTIFICATE_ID, deliveryType: "COLLEGE_BULK", recipientName: "Asha Rao", phone: "9876543210" });
    expect(session.amountPaise).toBe(9_900);
    expect(db.certificatePrintOrder.create.mock.calls[0][0].data).toMatchObject({
      deliveryType: "COLLEGE_BULK",
      amountPaise: 9_900,
      collegeName: "ABC Institute",
      deliveryZone: null,
      expectedDelivery: "7–12 working days",
      pincode: null,
    });
  });

  it("starts no payment while ordering is paused or the zone has no price", async () => {
    settings.row = { ...OWNER_SETTINGS, orderingOpen: false };
    await expect(startPrintCheckout(STUDENT, courier)).rejects.toThrow("cannot be ordered right now");
    settings.row = { ...OWNER_SETTINGS, courierOutsidePricePaise: null };
    await expect(startPrintCheckout(STUDENT, { ...courier, pincode: "560038" })).rejects.toThrow("not available for this PIN code");
    expect(rp.createOrder).not.toHaveBeenCalled();
    expect(db.certificatePrintOrder.create).not.toHaveBeenCalled();
  });
});

describe("updatePrintSettings", () => {
  const form = {
    orderingOpen: true,
    collegeBulkPrice: "99",
    courierNcrPrice: "149",
    courierOutsidePrice: "179",
    collegeBulkDelivery: "7–12 working days",
    courierNcrDelivery: "5–8 working days",
    courierOutsideDelivery: "7–12 working days",
    ncrPinPrefixes: ["110", "201", "122", "121", "110"],
    courierPartner: "",
  };

  it("is for administrators only", async () => {
    await expect(updatePrintSettings(STUDENT, form)).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.printSettings.upsert).not.toHaveBeenCalled();
  });

  it("saves rupees as paise, removes repeated PIN codes and audits the old and new values", async () => {
    const saved = await updatePrintSettings(ADMIN, form);
    expect(saved).toEqual({ ...OWNER_SETTINGS });
    const upsert = db.printSettings.upsert.mock.calls[0][0];
    expect(upsert.where).toEqual({ id: 1 });
    expect(upsert.update).toMatchObject({ courierOutsidePricePaise: 17_900, ncrPinPrefixes: ["110", "201", "122", "121"], courierPartner: null, updatedById: ADMIN.id });
    const audit = db.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ actorId: ADMIN.id, action: "PRINT_SETTINGS_UPDATED", resourceType: "PrintSettings" });
    expect(audit.diffPayload.after.courierNcrPricePaise).toBe(14_900);
  });

  it("refuses incomplete or invalid settings", async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ courierNcrDelivery: "" }, "delivery time within NCR"],
      [{ ncrPinPrefixes: [] }, "Add the NCR PIN codes"],
      [{ ncrPinPrefixes: ["011"] }, "do not start with 0"],
      [{ courierOutsidePrice: "20000" }, "between ₹1 and ₹10,000"],
      [{ collegeBulkPrice: "99.5" }, "whole rupee amount"],
      [{ collegeBulkPrice: "", courierNcrPrice: "", courierOutsidePrice: "" }, "at least one price"],
    ];
    for (const [change, message] of cases) {
      await expect(updatePrintSettings(ADMIN, { ...form, ...change })).rejects.toThrow(message);
    }
    expect(db.printSettings.upsert).not.toHaveBeenCalled();
  });

  it("can pause ordering and close an option by clearing its price", async () => {
    const saved = await updatePrintSettings(ADMIN, { ...form, orderingOpen: false, courierOutsidePrice: "", courierOutsideDelivery: "" });
    expect(saved).toMatchObject({ orderingOpen: false, courierOutsidePricePaise: null, courierOutsideDelivery: null });
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

  it("uses the courier partner from the print settings when none is typed", async () => {
    settings.row = { ...OWNER_SETTINGS, courierPartner: "India Post Speed Post" };
    db.certificatePrintOrder.updateMany.mockResolvedValue({ count: 1 });
    db.certificatePrintOrder.findUnique
      .mockResolvedValueOnce({ id: ORDER_ID, status: "PRINTED", deliveryType: "COURIER" })
      .mockResolvedValueOnce({ deliveryType: "COURIER", amountPaise: 14_900, receiptNo: "R", courierName: "India Post Speed Post", trackingNo: "EM1", user: { name: "Asha", email: "s@example.test" } });
    await advancePrintOrder(ADMIN, { orderId: ORDER_ID, status: "SHIPPED", trackingNo: "EM1" }, new Date());
    expect(db.certificatePrintOrder.updateMany.mock.calls[0][0].data).toMatchObject({ courierName: "India Post Speed Post" });
  });
});

describe("print order emails", () => {
  it("shows the tracking number when shipped", () => {
    const email = renderPrintOrderUpdateEmail({ status: "SHIPPED", courierName: "Blue Dart", trackingNo: "BD123", delivery: "Courier" });
    expect(email.subject).toContain("on its way");
    expect(email.text).toContain("BD123");
  });

  it("tells the student the promised delivery time when the order is paid", () => {
    const email = renderPrintOrderUpdateEmail({ status: "PAID", amount: "₹149", receiptNo: "R1", expectedDelivery: "5–8 working days", delivery: "Courier" });
    expect(email.text).toContain("Expected delivery: 5–8 working days");
  });
});
