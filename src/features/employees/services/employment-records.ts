import {
  EmploymentPeriodEndReason,
  EmploymentPeriodStartReason,
  EmploymentType,
  Prisma,
  Role,
} from "@prisma/client";

/*
 * Transaction helpers shared by the joining, exit and conversion flows. Every helper takes
 * the transaction client, so the writes succeed or fail together with the business change.
 */

type Tx = Prisma.TransactionClient;

export type JoiningRole = typeof Role.INTERN | typeof Role.EMPLOYEE;

/**
 * Grants the portal role that comes with joining. `assignedAt` is always refreshed, even when
 * a stale row exists, because it drives the portal upgrade banner.
 */
export async function grantJoiningRole(
  tx: Tx,
  userId: string,
  role: JoiningRole,
  actorId: string | null,
  now: Date
): Promise<void> {
  await tx.userRole.upsert({
    where: { userId_role: { userId, role } },
    create: { userId, role, assignedBy: actorId, assignedAt: now },
    update: { assignedBy: actorId, assignedAt: now },
  });
}

/**
 * Removes a joining role left over from an earlier employment type (a former employee who
 * re-joins as an intern, or an intern converted to full time), so the portal stage follows
 * the current employment type.
 */
export async function revokeJoiningRole(tx: Tx, userId: string, role: JoiningRole): Promise<number> {
  const removed = await tx.userRole.deleteMany({ where: { userId, role } });
  return removed.count;
}

export interface OpenPeriodInput {
  employeeId: string;
  employmentType: EmploymentType | null;
  designation: string;
  department: string;
  startDate: Date;
  startReason: EmploymentPeriodStartReason;
  applicationId: string | null;
  createdById: string | null;
}

/** Opens a new current employment period (endDate null). */
export async function openEmploymentPeriod(tx: Tx, input: OpenPeriodInput): Promise<{ id: string }> {
  return tx.employmentPeriod.create({
    data: {
      employeeId: input.employeeId,
      employmentType: input.employmentType,
      designation: input.designation,
      department: input.department,
      startDate: input.startDate,
      startReason: input.startReason,
      applicationId: input.applicationId,
      createdById: input.createdById,
    },
    select: { id: true },
  });
}

/** Closes the employee's current period(s); returns how many were closed. */
export async function closeCurrentPeriods(
  tx: Tx,
  employeeId: string,
  endDate: Date,
  endReason: EmploymentPeriodEndReason
): Promise<number> {
  const closed = await tx.employmentPeriod.updateMany({
    where: { employeeId, endDate: null },
    data: { endDate, endReason },
  });
  return closed.count;
}

/** True for a Prisma unique-constraint violation (detected structurally). */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}
