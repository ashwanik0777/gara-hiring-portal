import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import { Prisma, Role } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth/guards";

// ---------------------------------------------------------------------------
// Round 6: payout details live in `EmployeePayoutProfile`. Account numbers and PANs are
// stored AES-256-GCM encrypted next to their last four characters; read paths select
// only the browser-safe columns; counts, eligibility, the type filter and the register
// CSV are computed in SQL; everything stays behind role + `canPayroll`.
// ---------------------------------------------------------------------------

const { mockDb, resetMockDb } = vi.hoisted(() => {
  const model = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  });
  const db = {
    employee: model(),
    employeePayoutProfile: model(),
    payrollPeriod: model(),
    payrollRecord: model(),
    auditLog: model(),
    subAdminPermission: model(),
    $transaction: vi.fn(),
  };
  const reset = () => {
    for (const value of Object.values(db)) {
      if (typeof value === "function") value.mockReset();
      else for (const fn of Object.values(value)) fn.mockReset();
    }
    for (const value of Object.values(db)) {
      if (typeof value === "function") continue;
      value.findMany.mockResolvedValue([]);
      value.count.mockResolvedValue(0);
      value.groupBy.mockResolvedValue([]);
      value.aggregate.mockResolvedValue({ _sum: { disbursedAmount: null } });
    }
    db.$transaction.mockImplementation(async (arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: typeof db) => Promise<unknown>)(db) : Promise.all(arg as Promise<unknown>[])
    );
    db.subAdminPermission.findUnique.mockResolvedValue(null);
    db.auditLog.create.mockResolvedValue({ id: "audit-1" });
  };
  reset();
  return { mockDb: db, resetMockDb: reset };
});

vi.mock("@/lib/db", () => ({ prisma: mockDb }));

import { decodePayoutEncryptionKey } from "@/lib/env";
import {
  FIELD_ENCRYPTION_VERSION,
  FieldDecryptionError,
  FieldEncryptionUnavailableError,
  FieldEncryptor,
  payoutFieldEncryptor,
  type FieldEncryptionConfig,
} from "@/lib/security/field-encryption";
import { toActionError } from "@/lib/errors";
import {
  payrollService,
  payoutFieldContext,
  resolveEmployeePayoutInfo,
  maskFromLast4,
  type PayoutProfileRow,
} from "@/features/payroll/services/payroll-service";
import { PAYROLL_EXPORT_MAX_ROWS } from "@/features/payroll/schemas";

const adminUser: AuthenticatedUser = { id: "user-admin", email: "a@t.test", name: "Admin", roles: [Role.ADMIN] };
const hrUser: AuthenticatedUser = { id: "user-hr", email: "h@t.test", name: "HR", roles: [Role.HR] };
const managerUser: AuthenticatedUser = { id: "user-mgr", email: "m@t.test", name: "Manager", roles: [Role.MANAGER] };

const EMPLOYEE_ID = "33333333-3333-4333-8333-333333333333";
const PERIOD_ID = "11111111-1111-4111-8111-111111111111";
const RECORD_ID = "22222222-2222-4222-8222-222222222222";
const FULL_ACCOUNT = "000011112222";
const FULL_PAN = "QWERT9876Z";
const HEX_KEY = "a".repeat(64);
const BASE64_KEY = crypto.randomBytes(32).toString("base64");
const AUTH_SECRET = "a-test-auth-secret-that-is-at-least-32-chars";

function encryptorFor(overrides: Partial<FieldEncryptionConfig> = {}): FieldEncryptor {
  return new FieldEncryptor(() => ({ nodeEnv: "test", authSecret: AUTH_SECRET, ...overrides }));
}

function permissionRow(userId: string, canPayroll: boolean) {
  return {
    id: `perm-${userId}`,
    userId,
    canApplications: true,
    canOpenings: true,
    canInterviews: true,
    canEvaluations: true,
    canEmployees: true,
    canAttendance: true,
    canLeave: true,
    canPayroll,
    canReports: true,
    canManageSubAdmins: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function profileRow(overrides: Partial<PayoutProfileRow> = {}): PayoutProfileRow {
  return {
    isPaid: true,
    employmentType: "INTERN",
    stipendAmount: new Prisma.Decimal(12000),
    bankName: "Test Bank",
    accountNumberLast4: "2222",
    ifscCode: "TEST0000001",
    accountHolderName: "Test Holder",
    panLast4: "876Z",
    ...overrides,
  };
}

type Args = Record<string, unknown>;
const firstArgs = (fn: { mock: { calls: unknown[][] } }) => fn.mock.calls[0][0] as Args;

/** Every argument object passed to a read method of any model. */
function readCallArgs(): string {
  const reads: unknown[] = [];
  for (const value of Object.values(mockDb)) {
    if (typeof value === "function") continue;
    for (const fn of [value.findMany, value.findUnique, value.findFirst, value.count, value.groupBy, value.aggregate]) {
      reads.push(...fn.mock.calls);
    }
  }
  return JSON.stringify(reads);
}

beforeEach(() => {
  resetMockDb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Field encryption
// ---------------------------------------------------------------------------

describe("Field encryption (AES-256-GCM, versioned, context-bound)", () => {
  it("round-trips with a configured hex or base64 key and uses a fresh IV every time", () => {
    for (const key of [HEX_KEY, BASE64_KEY]) {
      const enc = encryptorFor({ encryptionKey: key, nodeEnv: "production" });
      const a = enc.encrypt(FULL_ACCOUNT, "ctx-1");
      const b = enc.encrypt(FULL_ACCOUNT, "ctx-1");
      expect(a).not.toBe(b);
      expect(enc.decrypt(a, "ctx-1")).toBe(FULL_ACCOUNT);
      expect(enc.decrypt(b, "ctx-1")).toBe(FULL_ACCOUNT);
      expect(enc.keySource()).toBe("configured");
    }
  });

  it("produces the versioned v1:<iv>:<tag>:<ciphertext> base64url format without the plaintext", () => {
    const payload = encryptorFor({ encryptionKey: HEX_KEY }).encrypt(FULL_PAN, "ctx");
    expect(FIELD_ENCRYPTION_VERSION).toBe("v1");
    // 12-byte IV = 16 chars, 16-byte tag = 22 chars (base64url, no padding).
    expect(payload).toMatch(/^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+$/);
    expect(payload).not.toContain(FULL_PAN);
    const [, iv, tag] = payload.split(":");
    expect(Buffer.from(iv, "base64url")).toHaveLength(12);
    expect(Buffer.from(tag, "base64url")).toHaveLength(16);
  });

  it("detects tampering, a wrong context, a wrong key and unsupported formats", () => {
    const enc = encryptorFor({ encryptionKey: HEX_KEY });
    const payload = enc.encrypt(FULL_ACCOUNT, "employee-payout:e1:accountNumber");
    const parts = payload.split(":");
    const flip = (part: string) => {
      const bytes = Buffer.from(part, "base64url");
      bytes[0] ^= 0x01;
      return bytes.toString("base64url");
    };
    for (const index of [1, 2, 3]) {
      const tampered = parts.map((p, i) => (i === index ? flip(p) : p)).join(":");
      expect(() => enc.decrypt(tampered, "employee-payout:e1:accountNumber")).toThrow(FieldDecryptionError);
    }
    // A ciphertext moved to another employee or column does not decrypt.
    expect(() => enc.decrypt(payload, "employee-payout:e2:accountNumber")).toThrow(FieldDecryptionError);
    expect(() => enc.decrypt(payload, "employee-payout:e1:pan")).toThrow(FieldDecryptionError);
    expect(() => encryptorFor({ encryptionKey: "b".repeat(64) }).decrypt(payload, "employee-payout:e1:accountNumber")).toThrow(
      FieldDecryptionError
    );
    expect(() => enc.decrypt(payload.replace(/^v1:/, "v2:"), "employee-payout:e1:accountNumber")).toThrow(FieldDecryptionError);
    expect(() => enc.decrypt("v1:not*base64:x:y", "ctx")).toThrow(FieldDecryptionError);
    expect(() => enc.decrypt(FULL_ACCOUNT, "ctx")).toThrow(FieldDecryptionError);
    expect(() => enc.encrypt(FULL_ACCOUNT, "")).toThrow();
  });

  it("refuses to encrypt in production without a key, with a friendly operational message", () => {
    const enc = encryptorFor({ nodeEnv: "production", encryptionKey: undefined });
    expect(enc.keySource()).toBeNull();
    let thrown: unknown;
    try {
      enc.encrypt(FULL_ACCOUNT, "ctx");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(FieldEncryptionUnavailableError);
    expect(thrown).toMatchObject({ code: "FIELD_ENCRYPTION_NOT_CONFIGURED", isOperational: true });
    const message = toActionError(thrown, "fallback");
    expect(message).toMatch(/Payout bank details can't be saved until the payout encryption key is configured/);
    // An empty value counts as "not configured".
    expect(() => encryptorFor({ nodeEnv: "production", encryptionKey: "  " }).encrypt("x", "ctx")).toThrow(
      FieldEncryptionUnavailableError
    );
  });

  it("outside production derives a development key from BETTER_AUTH_SECRET and warns once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const enc = encryptorFor({ nodeEnv: "development" });
    const payload = enc.encrypt(FULL_ACCOUNT, "ctx");
    enc.encrypt(FULL_PAN, "ctx");
    expect(enc.keySource()).toBe("development");
    expect(warn.mock.calls.filter((call) => String(call[0]).includes("PAYOUT_ENCRYPTION_KEY"))).toHaveLength(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(AUTH_SECRET);

    // Deterministic per secret (HKDF), different for another secret or a configured key.
    expect(encryptorFor({ nodeEnv: "development" }).decrypt(payload, "ctx")).toBe(FULL_ACCOUNT);
    expect(() =>
      encryptorFor({ nodeEnv: "development", authSecret: "another-secret-that-is-long-enough-123" }).decrypt(payload, "ctx")
    ).toThrow(FieldDecryptionError);
    expect(() => encryptorFor({ encryptionKey: HEX_KEY }).decrypt(payload, "ctx")).toThrow(FieldDecryptionError);
  });

  it("accepts only 32-byte keys encoded as hex, base64 or base64url", () => {
    const raw = crypto.randomBytes(32);
    expect(decodePayoutEncryptionKey(raw.toString("hex"))?.equals(raw)).toBe(true);
    expect(decodePayoutEncryptionKey(raw.toString("base64"))?.equals(raw)).toBe(true);
    expect(decodePayoutEncryptionKey(raw.toString("base64url"))?.equals(raw)).toBe(true);
    expect(decodePayoutEncryptionKey(crypto.randomBytes(31).toString("base64"))).toBeNull();
    expect(decodePayoutEncryptionKey(crypto.randomBytes(33).toString("hex"))).toBeNull();
    expect(decodePayoutEncryptionKey("not-a-key")).toBeNull();
    expect(decodePayoutEncryptionKey("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Masked display
// ---------------------------------------------------------------------------

describe("Masked payout display from the last-4 columns", () => {
  it("masks as •••• 1234 and keeps 'Not configured' (null) for a missing row or column", () => {
    const view = resolveEmployeePayoutInfo(profileRow());
    expect(view).toEqual({
      isPaid: true,
      employmentType: "INTERN",
      stipendAmount: 12000,
      bankName: "Test Bank",
      accountNumberMasked: "•••• 2222",
      ifscCode: "TEST0000001",
      accountHolderName: "Test Holder",
      panMasked: "•••• 876Z",
    });
    expect(maskFromLast4(null)).toBeNull();
    expect(maskFromLast4("")).toBeNull();

    expect(resolveEmployeePayoutInfo(null)).toEqual({
      isPaid: null,
      employmentType: null,
      stipendAmount: null,
      bankName: null,
      accountNumberMasked: null,
      ifscCode: null,
      accountHolderName: null,
      panMasked: null,
    });
    const partial = resolveEmployeePayoutInfo(
      profileRow({ employmentType: null, stipendAmount: null, bankName: "  ", accountNumberLast4: null, panLast4: null })
    );
    expect(partial).toMatchObject({
      employmentType: null,
      stipendAmount: null,
      bankName: null,
      accountNumberMasked: null,
      panMasked: null,
    });
    // Unpaid employees never show an amount.
    expect(resolveEmployeePayoutInfo(profileRow({ isPaid: false })).stipendAmount).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Writes: upsert, encryption, clearing, audit
// ---------------------------------------------------------------------------

describe("Payout profile writes", () => {
  it("creates the profile with encrypted identifiers, last-4 columns, the editor and a masked audit entry", async () => {
    mockDb.employee.findUnique.mockResolvedValue({ id: EMPLOYEE_ID, payoutProfile: null });
    mockDb.employeePayoutProfile.upsert.mockResolvedValue(profileRow());
    mockDb.payrollRecord.count.mockResolvedValue(0);

    await payrollService.updateEmployeePayoutProfile(adminUser, {
      employeeId: EMPLOYEE_ID,
      isPaid: true,
      employmentType: "INTERN",
      stipendAmount: 12000,
      bankName: "Test Bank",
      accountNumber: FULL_ACCOUNT,
      ifscCode: "TEST0000001",
      accountHolderName: "Test Holder",
      panNumber: FULL_PAN,
    });

    expect(mockDb.employee.update).not.toHaveBeenCalled();
    const args = firstArgs(mockDb.employeePayoutProfile.upsert) as {
      where: Args;
      create: Record<string, unknown>;
      update: Record<string, unknown>;
      select: Args;
    };
    expect(args.where).toEqual({ employeeId: EMPLOYEE_ID });
    expect(args.create).toMatchObject({
      employeeId: EMPLOYEE_ID,
      isPaid: true,
      employmentType: "INTERN",
      stipendAmount: 12000,
      accountNumberLast4: "2222",
      panLast4: "876Z",
      updatedById: adminUser.id,
    });
    expect(args.update).toMatchObject({ isPaid: true, accountNumberLast4: "2222", updatedById: adminUser.id });
    expect(args.select).not.toHaveProperty("accountNumberEncrypted");
    expect(args.select).not.toHaveProperty("panEncrypted");

    const accountCipher = String(args.create.accountNumberEncrypted);
    const panCipher = String(args.create.panEncrypted);
    expect(accountCipher.startsWith("v1:")).toBe(true);
    expect(JSON.stringify(args)).not.toContain(FULL_ACCOUNT);
    expect(JSON.stringify(args)).not.toContain(FULL_PAN);
    // Bound to this employee and column (decrypt exists only for a future bank export).
    expect(payoutFieldEncryptor.decrypt(accountCipher, payoutFieldContext(EMPLOYEE_ID, "accountNumber"))).toBe(FULL_ACCOUNT);
    expect(payoutFieldEncryptor.decrypt(panCipher, payoutFieldContext(EMPLOYEE_ID, "pan"))).toBe(FULL_PAN);
    expect(() => payoutFieldEncryptor.decrypt(accountCipher, payoutFieldContext(EMPLOYEE_ID, "pan"))).toThrow();

    const audit = firstArgs(mockDb.auditLog.create) as { data: Record<string, unknown> };
    expect(audit.data).toMatchObject({
      action: "PAYROLL_PAYOUT_PROFILE_UPDATED",
      resourceType: "EMPLOYEE_PAYOUT_PROFILE",
      resourceId: EMPLOYEE_ID,
      actorId: adminUser.id,
      diffPayload: expect.objectContaining({
        created: true,
        accountNumber: "•••• 2222",
        panNumber: "•••• 876Z",
        isPaid: { from: null, to: true },
        changedFields: expect.arrayContaining(["isPaid", "stipendAmount", "accountNumber", "panNumber"]),
      }),
    });
    const auditJson = JSON.stringify(audit);
    expect(auditJson).not.toContain(FULL_ACCOUNT);
    expect(auditJson).not.toContain(FULL_PAN);
    expect(auditJson).not.toContain(accountCipher);
  });

  it("keeps omitted fields, clears both identifier columns on null and keeps a hidden unpaid amount", async () => {
    mockDb.employee.findUnique.mockResolvedValue({
      id: EMPLOYEE_ID,
      payoutProfile: profileRow({ isPaid: false }),
    });
    mockDb.employeePayoutProfile.upsert.mockResolvedValue(
      profileRow({ isPaid: false, bankName: null, accountNumberLast4: null, panLast4: null })
    );
    mockDb.payrollRecord.count.mockResolvedValue(1);

    const result = await payrollService.updateEmployeePayoutProfile(adminUser, {
      employeeId: EMPLOYEE_ID,
      isPaid: false,
      stipendAmount: null,
      bankName: null,
      accountNumber: null,
      panNumber: null,
    });

    expect(result.openRecordCount).toBe(1);
    const update = (firstArgs(mockDb.employeePayoutProfile.upsert) as { update: Record<string, unknown> }).update;
    expect(update).toMatchObject({
      isPaid: false,
      bankName: null,
      accountNumberEncrypted: null,
      accountNumberLast4: null,
      panEncrypted: null,
      panLast4: null,
    });
    // Omitted fields are not written; the amount hidden from the browser is not cleared.
    for (const kept of ["employmentType", "ifscCode", "accountHolderName", "stipendAmount"]) {
      expect(update).not.toHaveProperty(kept);
    }
    const diff = (firstArgs(mockDb.auditLog.create) as { data: { diffPayload: Record<string, unknown> } }).data.diffPayload;
    expect(diff).toMatchObject({ created: false, accountNumber: null, panNumber: null });
    expect(diff.changedFields).toEqual(expect.arrayContaining(["bankName", "accountNumber", "panNumber"]));
    expect(mockDb.payrollRecord.updateMany).not.toHaveBeenCalled();
  });

  it("toggling paid/unpaid writes no identifier columns and never encrypts", async () => {
    const encrypt = vi.spyOn(payoutFieldEncryptor, "encrypt");
    mockDb.employee.findUnique.mockResolvedValue({ id: EMPLOYEE_ID, payoutProfile: profileRow() });
    mockDb.employeePayoutProfile.upsert.mockResolvedValue(profileRow({ isPaid: false }));

    await payrollService.updateEmployeePayoutProfile(adminUser, { employeeId: EMPLOYEE_ID, isPaid: false });

    expect(encrypt).not.toHaveBeenCalled();
    const update = (firstArgs(mockDb.employeePayoutProfile.upsert) as { update: Record<string, unknown> }).update;
    expect(Object.keys(update).sort()).toEqual(["isPaid", "updatedById"]);
  });

  it("refuses the whole save (no database write) when the key is missing in production", async () => {
    vi.spyOn(payoutFieldEncryptor, "encrypt").mockImplementation(() => {
      throw new FieldEncryptionUnavailableError();
    });

    const error = await payrollService
      .updateEmployeePayoutProfile(adminUser, { employeeId: EMPLOYEE_ID, isPaid: true, accountNumber: FULL_ACCOUNT })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(FieldEncryptionUnavailableError);
    expect(toActionError(error, "fallback")).toMatch(/can't be saved until the payout encryption key is configured/);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
    expect(mockDb.employeePayoutProfile.upsert).not.toHaveBeenCalled();
    expect(mockDb.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown employee without writing", async () => {
    mockDb.employee.findUnique.mockResolvedValue(null);
    await expect(
      payrollService.updateEmployeePayoutProfile(adminUser, { employeeId: EMPLOYEE_ID, isPaid: true })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDb.employeePayoutProfile.upsert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Reads: SQL counts, eligibility, filters, export, no encrypted columns
// ---------------------------------------------------------------------------

function primePeriod(status = "FINALIZED") {
  const period = {
    id: PERIOD_ID,
    code: "2026-04",
    startDate: new Date("2026-04-01T00:00:00.000Z"),
    endDate: new Date("2026-04-30T00:00:00.000Z"),
    status,
    notes: null,
  };
  mockDb.payrollPeriod.findMany.mockResolvedValue([period]);
  mockDb.payrollPeriod.findUnique.mockResolvedValue(period);
}

function registerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RECORD_ID,
    payrollPeriodId: PERIOD_ID,
    employeeId: EMPLOYEE_ID,
    status: "FINALIZED",
    disbursementReference: null,
    disbursedAt: null,
    disbursedAmount: null,
    notes: null,
    finalizedAt: null,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    finalizedBy: null,
    employee: {
      employeeCode: "EMP-0001",
      department: "Engineering",
      designation: "Intern",
      payoutProfile: profileRow(),
      user: { name: "Test Employee", email: "employee@example.test" },
    },
    ...overrides,
  };
}

describe("Payout reads are computed in SQL and never select encrypted columns", () => {
  it("counts the paid / unpaid / unconfigured workforce with groupBy and count", async () => {
    primePeriod();
    mockDb.employeePayoutProfile.groupBy.mockResolvedValue([
      { isPaid: true, _count: { _all: 40 } },
      { isPaid: false, _count: { _all: 7 } },
    ]);
    mockDb.employee.count.mockImplementation(async (args?: { where?: Args }) =>
      JSON.stringify(args?.where ?? {}).includes('"payoutProfile":{"is":null}') ? 3 : 50
    );

    const data = await payrollService.getPayrollDashboardData(adminUser);

    expect(mockDb.employeePayoutProfile.groupBy).toHaveBeenCalledWith({ by: ["isPaid"], _count: { _all: true } });
    expect(mockDb.employee.count).toHaveBeenCalledWith({ where: { payoutProfile: { is: null } } });
    expect(data.stats).toMatchObject({ totalPaidWorkforce: 40, totalUnpaidWorkforce: 7, totalUnconfiguredWorkforce: 3 });
    // The only employee row read is the bounded directory page.
    expect(mockDb.employee.findMany).toHaveBeenCalledTimes(1);
    expect(typeof firstArgs(mockDb.employee.findMany).take).toBe("number");
  });

  it("filters the register by employment type with a join, counted on the same filter", async () => {
    primePeriod();
    await payrollService.getPayrollDashboardData(adminUser, { type: "INTERN", status: "FINALIZED" });

    const where = firstArgs(mockDb.payrollRecord.findMany).where;
    expect(where).toMatchObject({
      payrollPeriodId: PERIOD_ID,
      status: "FINALIZED",
      employee: { payoutProfile: { is: { employmentType: "INTERN" } } },
    });
    expect(mockDb.payrollRecord.count).toHaveBeenCalledWith({ where });
  });

  it("maps register, directory and self rows from the last-4 columns and never selects ciphertext", async () => {
    primePeriod();
    mockDb.payrollRecord.findMany.mockResolvedValue([registerRow()]);
    mockDb.employee.findMany.mockResolvedValue([
      {
        id: EMPLOYEE_ID,
        employeeCode: "EMP-0001",
        department: "Engineering",
        designation: "Intern",
        joiningDate: new Date("2026-01-01T00:00:00.000Z"),
        payoutProfile: profileRow(),
        user: { name: "Test Employee", email: "employee@example.test" },
      },
    ]);
    const data = await payrollService.getPayrollDashboardData(adminUser);
    expect(data.records[0]).toMatchObject({ accountNumberMasked: "•••• 2222", panMasked: "•••• 876Z", stipendAmount: 12000 });
    expect(data.employees[0]).toMatchObject({ accountNumberMasked: "•••• 2222", employmentType: "INTERN" });

    mockDb.payrollRecord.findMany.mockResolvedValue([]);
    mockDb.employee.findUnique.mockResolvedValue({
      id: EMPLOYEE_ID,
      employeeCode: "EMP-0001",
      department: "Engineering",
      designation: "Intern",
      payoutProfile: profileRow(),
      user: { name: "Test Employee" },
    });
    const overview = await payrollService.getMyPayrollOverview({ ...adminUser, roles: [Role.INTERN] });
    expect(overview.payout?.panMasked).toBe("•••• 876Z");
    expect(firstArgs(mockDb.employee.findUnique).where).toEqual({ userId: adminUser.id });

    await payrollService.exportPayrollRegister(adminUser, { periodId: PERIOD_ID });

    const reads = readCallArgs();
    expect(reads).toContain("accountNumberLast4");
    expect(reads).not.toContain("Encrypted");
    expect(reads).not.toContain("internalNotes");
  });

  it("enrols only employees configured as paid, decided in SQL", async () => {
    mockDb.payrollPeriod.findUnique.mockResolvedValue({ id: PERIOD_ID, code: "2026-04" });
    mockDb.payrollPeriod.updateMany.mockResolvedValue({ count: 1 });
    mockDb.employee.findMany.mockResolvedValue([{ id: EMPLOYEE_ID }]);
    mockDb.employee.count.mockResolvedValue(2);
    mockDb.payrollRecord.createMany.mockResolvedValue({ count: 1 });

    const result = await payrollService.generatePayrollRecordsForPeriod(adminUser, PERIOD_ID);

    expect(result).toEqual({ enrolledCount: 1, skippedUnconfiguredCount: 2 });
    const eligibleWhere = firstArgs(mockDb.employee.findMany).where;
    expect(eligibleWhere).toEqual({
      status: { in: ["ACTIVE", "PROBATION"] },
      payrollRecords: { none: { payrollPeriodId: PERIOD_ID } },
      payoutProfile: { is: { isPaid: true } },
    });
    expect(firstArgs(mockDb.employee.findMany).select).toEqual({ id: true });
    expect(firstArgs(mockDb.employee.count).where).toMatchObject({ payoutProfile: { is: null } });
    expect(mockDb.payrollRecord.createMany.mock.calls[0][0].data).toEqual([
      { payrollPeriodId: PERIOD_ID, employeeId: EMPLOYEE_ID, status: "DRAFT" },
    ]);
  });

  it("disburses with the configured amount from the profile and refuses unpaid profiles", async () => {
    const finalized = {
      id: RECORD_ID,
      payrollPeriodId: PERIOD_ID,
      employeeId: EMPLOYEE_ID,
      status: "FINALIZED",
      notes: null,
      payrollPeriod: { id: PERIOD_ID, code: "2026-04" },
      employee: { payoutProfile: { isPaid: true, stipendAmount: new Prisma.Decimal(15000) } },
    };
    mockDb.payrollRecord.findUnique.mockResolvedValue(finalized);
    mockDb.payrollPeriod.updateMany.mockResolvedValue({ count: 1 });
    mockDb.payrollRecord.updateMany.mockResolvedValue({ count: 1 });
    mockDb.payrollRecord.count.mockResolvedValue(1);

    await payrollService.recordDisbursement(adminUser, { payrollRecordId: RECORD_ID, disbursementReference: "BANK-REF-1" });
    expect(mockDb.payrollRecord.updateMany.mock.calls[0][0].data.disbursedAmount).toBe(15000);
    const include = firstArgs(mockDb.payrollRecord.findUnique).include as Args;
    expect(JSON.stringify(include)).not.toContain("Encrypted");

    mockDb.payrollRecord.updateMany.mockClear();
    mockDb.payrollRecord.findUnique.mockResolvedValue({ ...finalized, employee: { payoutProfile: null } });
    await expect(
      payrollService.recordDisbursement(adminUser, { payrollRecordId: RECORD_ID, disbursementReference: "BANK-REF-1" })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mockDb.payrollRecord.updateMany).not.toHaveBeenCalled();
  });

  it("bulk-disburses only records whose employee is configured as paid (SQL join)", async () => {
    mockDb.payrollPeriod.findUnique.mockResolvedValue({ id: PERIOD_ID, code: "2026-04" });
    mockDb.payrollPeriod.updateMany.mockResolvedValue({ count: 1 });
    mockDb.payrollRecord.count.mockResolvedValueOnce(3).mockResolvedValue(0);
    mockDb.payrollRecord.findMany.mockResolvedValue([
      { id: RECORD_ID, employee: { payoutProfile: { isPaid: true, stipendAmount: null } } },
    ]);
    mockDb.payrollRecord.updateMany.mockResolvedValue({ count: 1 });

    const result = await payrollService.bulkDisburseRecords(adminUser, {
      periodId: PERIOD_ID,
      disbursementReference: "BANK-BATCH-1",
    });

    expect(result).toEqual({ updatedCount: 1, skippedNotPaidCount: 2, periodPaid: true });
    expect(firstArgs(mockDb.payrollRecord.findMany).where).toEqual({
      payrollPeriodId: PERIOD_ID,
      status: "FINALIZED",
      employee: { payoutProfile: { is: { isPaid: true } } },
    });
    // No configured amount: recorded as null, never a default.
    expect(mockDb.payrollRecord.updateMany.mock.calls[0][0].data.disbursedAmount).toBeNull();
  });

  it("exports the filtered register of the whole cycle from SQL, masked, bounded and audited", async () => {
    primePeriod();
    mockDb.payrollRecord.findMany.mockResolvedValue([
      registerRow(),
      registerRow({
        id: "44444444-4444-4444-8444-444444444444",
        status: "PAID",
        disbursementReference: "=HYPERLINK(1)",
        disbursedAmount: new Prisma.Decimal(9000),
        employee: {
          employeeCode: "EMP-0002",
          department: "Engineering",
          designation: "Intern",
          payoutProfile: null,
          user: { name: "Second Employee", email: "second@example.test" },
        },
      }),
    ]);

    const result = await payrollService.exportPayrollRegister(adminUser, {
      periodId: PERIOD_ID,
      type: "INTERN",
      search: "emp",
    });

    const args = firstArgs(mockDb.payrollRecord.findMany);
    expect(args.take).toBe(PAYROLL_EXPORT_MAX_ROWS + 1);
    expect(args.skip).toBeUndefined();
    expect(args.where).toMatchObject({ payrollPeriodId: PERIOD_ID, employee: { payoutProfile: { is: { employmentType: "INTERN" } } } });
    expect(JSON.stringify(args.where)).toContain("emp");

    expect(result).toMatchObject({ filename: "Payroll_Register_2026-04.csv", rowCount: 2, truncated: false });
    const lines = result.csvContent.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('"Account Number (masked)"');
    expect(lines[1]).toContain('"•••• 2222"');
    expect(lines[1]).toContain('"12000"');
    // PAID rows report the disbursement snapshot; unset values read "Not configured".
    expect(lines[2]).toContain('"9000"');
    expect(lines[2]).toContain('"Not configured"');
    expect(lines[2]).toContain(`"'=HYPERLINK(1)"`);
    expect(result.csvContent).not.toContain(FULL_ACCOUNT);

    expect(mockDb.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "PAYROLL_REGISTER_EXPORTED",
          resourceId: PERIOD_ID,
          diffPayload: expect.objectContaining({ rowCount: 2, truncated: false }),
        }),
      })
    );
  });

  it("cuts an oversized export at the limit and says so", async () => {
    primePeriod();
    mockDb.payrollRecord.findMany.mockResolvedValue(
      Array.from({ length: PAYROLL_EXPORT_MAX_ROWS + 1 }, (_, i) => registerRow({ id: `rec-${i}` }))
    );
    const result = await payrollService.exportPayrollRegister(adminUser, { periodId: PERIOD_ID });
    expect(result.truncated).toBe(true);
    expect(result.rowCount).toBe(PAYROLL_EXPORT_MAX_ROWS);
    expect(result.csvContent.split("\n")).toHaveLength(PAYROLL_EXPORT_MAX_ROWS + 1);
  });

  it("rejects an export for an unknown period", async () => {
    mockDb.payrollPeriod.findUnique.mockResolvedValue(null);
    await expect(payrollService.exportPayrollRegister(adminUser, { periodId: PERIOD_ID })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockDb.payrollRecord.findMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// canPayroll gating
// ---------------------------------------------------------------------------

describe("Payout profile access requires a payroll role and canPayroll", () => {
  it("HR without canPayroll cannot read, export or edit payout profiles; nothing is encrypted or queried", async () => {
    const encrypt = vi.spyOn(payoutFieldEncryptor, "encrypt");

    await expect(payrollService.getPayrollDashboardData(hrUser)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(payrollService.exportPayrollRegister(hrUser, { periodId: PERIOD_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      payrollService.updateEmployeePayoutProfile(hrUser, { employeeId: EMPLOYEE_ID, isPaid: true, accountNumber: FULL_ACCOUNT })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(encrypt).not.toHaveBeenCalled();
    expect(mockDb.employeePayoutProfile.groupBy).not.toHaveBeenCalled();
    expect(mockDb.employeePayoutProfile.upsert).not.toHaveBeenCalled();
    expect(mockDb.payrollRecord.findMany).not.toHaveBeenCalled();
    expect(mockDb.auditLog.create).not.toHaveBeenCalled();
  });

  it("MANAGER is refused even with a canPayroll flag; HR holding canPayroll is allowed", async () => {
    mockDb.subAdminPermission.findUnique.mockResolvedValue(permissionRow(managerUser.id, true));
    await expect(
      payrollService.updateEmployeePayoutProfile(managerUser, { employeeId: EMPLOYEE_ID, isPaid: true })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(payrollService.exportPayrollRegister(managerUser, { periodId: PERIOD_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    mockDb.subAdminPermission.findUnique.mockResolvedValue(permissionRow(hrUser.id, true));
    mockDb.employee.findUnique.mockResolvedValue({ id: EMPLOYEE_ID, payoutProfile: null });
    mockDb.employeePayoutProfile.upsert.mockResolvedValue(profileRow({ isPaid: false }));
    await expect(
      payrollService.updateEmployeePayoutProfile(hrUser, { employeeId: EMPLOYEE_ID, isPaid: false })
    ).resolves.toEqual({ openRecordCount: 0 });
    expect((firstArgs(mockDb.employeePayoutProfile.upsert) as { create: Args }).create.updatedById).toBe(hrUser.id);
  });
});
