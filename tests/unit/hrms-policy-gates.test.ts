import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { attendanceService } from "@/features/attendance/services/attendance-service";
import { leaveService } from "@/features/leave/services/leave-service";
import { payrollService } from "@/features/payroll/services/payroll-service";
import {
  LogAttendanceSchema,
  RequestRegularizationSchema,
  ReviewRegularizationSchema,
} from "@/features/attendance/schemas";
import {
  CreateLeaveRequestSchema,
  ReviewLeaveRequestSchema,
} from "@/features/leave/schemas";
import {
  CreatePayrollPeriodSchema,
  RecordDisbursementSchema,
} from "@/features/payroll/schemas";
import { PolicyBlockedError } from "@/lib/errors";

describe("Prompt 8A: Attendance Module Policy Gates & Validations (OD-006 / D-10)", () => {
  it("strictly throws PolicyBlockedError when attempting overtime or lateness deduction calculation", () => {
    expect(() => attendanceService.calculateLatenessOrOvertime()).toThrow(PolicyBlockedError);
    try {
      attendanceService.calculateLatenessOrOvertime();
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(PolicyBlockedError);
      expect((err as PolicyBlockedError).decisionRef).toBe("OD-006");
    }
  });

  it("strictly throws PolicyBlockedError when attempting automatic attendance inference from timers", () => {
    expect(() => attendanceService.inferAttendanceFromTimers()).toThrow(PolicyBlockedError);
    try {
      attendanceService.inferAttendanceFromTimers();
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(PolicyBlockedError);
      expect((err as PolicyBlockedError).decisionRef).toBe("OD-006");
    }
  });

  it("validates safe daily attendance logging schema", () => {
    const valid = LogAttendanceSchema.safeParse({
      employeeId: crypto.randomUUID(),
      date: "2026-04-15T00:00:00.000Z",
      checkInTime: "2026-04-15T04:00:00.000Z",
      checkOutTime: "2026-04-15T13:00:00.000Z",
      notes: "On-site Bangalore office",
    });

    expect(valid.success).toBe(true);
  });

  it("validates daily attendance logging with status options (PRESENT, HALF_DAY, ON_LEAVE)", () => {
    const halfDay = LogAttendanceSchema.safeParse({
      employeeId: crypto.randomUUID(),
      date: "2026-04-15T00:00:00.000Z",
      status: "HALF_DAY",
      checkInTime: "2026-04-15T04:00:00.000Z",
      checkOutTime: "2026-04-15T08:30:00.000Z",
      notes: "First half attended",
    });
    expect(halfDay.success).toBe(true);

    const onLeave = LogAttendanceSchema.safeParse({
      employeeId: crypto.randomUUID(),
      date: "2026-04-15T00:00:00.000Z",
      status: "ON_LEAVE",
      notes: "Casual leave approved",
    });
    expect(onLeave.success).toBe(true);
  });

  it("validates attendance regularization request schema", () => {
    const valid = RequestRegularizationSchema.safeParse({
      attendanceRecordId: crypto.randomUUID(),
      requestedCheckIn: "2026-04-15T04:00:00.000Z",
      requestedCheckOut: "2026-04-15T13:00:00.000Z",
      reason: "Forgot to punch out due to client meeting",
    });

    expect(valid.success).toBe(true);

    const invalid = RequestRegularizationSchema.safeParse({
      attendanceRecordId: crypto.randomUUID(),
      reason: "Bad", // < 5 characters
    });
    expect(invalid.success).toBe(false);
  });

  it("validates regularization review schema", () => {
    const valid = ReviewRegularizationSchema.safeParse({
      regularizationId: crypto.randomUUID(),
      status: "APPROVED",
      reviewNotes: "Verified with manager",
    });

    expect(valid.success).toBe(true);
  });
});

describe("Prompt 8B: Leave Module Policy Gates & Validations (OD-007 / D-11)", () => {
  it("strictly throws PolicyBlockedError when attempting leave balance accrual calculation", () => {
    expect(() => leaveService.calculateLeaveAccrualOrBalance()).toThrow(PolicyBlockedError);
    try {
      leaveService.calculateLeaveAccrualOrBalance();
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(PolicyBlockedError);
      expect((err as PolicyBlockedError).decisionRef).toBe("OD-007");
    }
  });

  it("strictly throws PolicyBlockedError when attempting leave encashment calculation", () => {
    expect(() => leaveService.calculateLeaveEncashment()).toThrow(PolicyBlockedError);
    try {
      leaveService.calculateLeaveEncashment();
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(PolicyBlockedError);
      expect((err as PolicyBlockedError).decisionRef).toBe("OD-007");
    }
  });

  it("validates safe leave request schema", () => {
    const valid = CreateLeaveRequestSchema.safeParse({
      employeeId: crypto.randomUUID(),
      leaveTypeId: crypto.randomUUID(),
      startDate: "2026-05-10T00:00:00.000Z",
      endDate: "2026-05-12T00:00:00.000Z",
      reason: "Attending family function",
    });

    expect(valid.success).toBe(true);
  });

  it("validates leave request review schema", () => {
    const valid = ReviewLeaveRequestSchema.safeParse({
      requestId: crypto.randomUUID(),
      status: "APPROVED",
      reviewNotes: "Work coverage confirmed",
    });

    expect(valid.success).toBe(true);
  });
});

describe("Prompt 8C: Payroll Module Policy Gates & Validations (OD-008 / D-12)", () => {
  it("strictly throws PolicyBlockedError when attempting gross/net salary calculation", () => {
    expect(() => payrollService.calculateGrossNetSalary()).toThrow(PolicyBlockedError);
    try {
      payrollService.calculateGrossNetSalary();
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(PolicyBlockedError);
      expect((err as PolicyBlockedError).decisionRef).toBe("OD-008");
    }
  });

  it("strictly throws PolicyBlockedError when attempting statutory tax calculation", () => {
    expect(() => payrollService.calculateStatutoryTaxes()).toThrow(PolicyBlockedError);
    try {
      payrollService.calculateStatutoryTaxes();
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(PolicyBlockedError);
      expect((err as PolicyBlockedError).decisionRef).toBe("OD-008");
    }
  });

  it("validates safe payroll period creation schema", () => {
    const valid = CreatePayrollPeriodSchema.safeParse({
      code: "2026-04",
      startDate: "2026-04-01T00:00:00.000Z",
      endDate: "2026-04-30T00:00:00.000Z",
      notes: "April 2026 monthly payroll cycle",
    });

    expect(valid.success).toBe(true);
  });

  it("validates safe disbursement tracking schema", () => {
    const valid = RecordDisbursementSchema.safeParse({
      payrollRecordId: crypto.randomUUID(),
      disbursementReference: "HDFC-NEFT-20260430001",
      notes: "Salary transferred via corporate net banking",
    });

    expect(valid.success).toBe(true);
  });
});
