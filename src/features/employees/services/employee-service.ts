import { prisma } from "@/lib/db";
import {
  containsPayoutProfileMarker,
  stripPayoutProfile,
} from "@/features/payroll/payout-notes";
import { assertPermission, hasPermission, type AuthenticatedUser } from "@/lib/auth/guards";
import {
  Role,
  ApplicationStatus,
  ConversionOfferStatus,
  ConversionReviewOutcome,
  ConversionReviewStatus,
  EmployeeStatus,
  EmploymentPeriodEndReason,
  EmploymentPeriodStartReason,
  EmploymentType,
  EvaluationStatus,
  OfferStatus,
  OpeningType,
  Prisma,
} from "@prisma/client";
import { cancelJobsByKeyPrefix } from "@/infrastructure/jobs/job-queue";
import {
  CreateEmployeeFromApplicationInput,
  JOINING_INITIAL_STATUSES,
  MarkInternJoinedInput,
  DirectCreateEmployeeInput,
  UpdateEmployeeStatusInput,
  AssignManagerInput,
  UpdateOnboardingChecklistInput,
  UploadEmployeeDocumentInput,
  ProcessExitInput,
} from "../schemas";
import {
  PublicEmployeeDirectoryItem,
  ConfidentialEmployeeDetail,
  EmployeeDetailCore,
  EmployeeDirectoryFilters,
  EmployeeDirectoryPage,
  EmployeeDirectoryQuery,
  EmployeeDocumentItem,
  EmployeeHistory,
  EmergencyContact,
  OnboardingChecklistItem,
  ReportingManagerOption,
  ReportingManagerQuery,
} from "../types";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PolicyBlockedError,
  ValidationError,
} from "@/lib/errors";
import { assertNotOwnApplication } from "@/features/recruitment/services/application-access";
import { isFutureJoiningDate } from "../joining";
import {
  calendarDayKey,
  conversionEffectiveDedupeKey,
  firstReviewDate,
  isReviewPeriodMonths,
} from "../conversion-rules";
import {
  grantJoiningRole,
  isUniqueViolation,
  openEmploymentPeriod,
  revokeJoiningRole,
} from "./employment-records";

const EMPLOYEE_ADMIN_ROLES: Role[] = [Role.ADMIN, Role.HR];

const DEFAULT_ONBOARDING_CHECKLIST: OnboardingChecklistItem[] = [
  { id: "ID_VERIFICATION", label: "Government ID and documentation verification", completed: false },
  { id: "WORKSTATION_SETUP", label: "Workstation and account access provisioning", completed: false },
  { id: "POLICY_ACKNOWLEDGMENT", label: "GARA Code of Conduct and Security Policy acknowledgment", completed: false },
  { id: "EMERGENCY_CONTACT", label: "Emergency contact verification", completed: false },
];

/**
 * Status changes allowed through the generic status update. EXITED is excluded on purpose:
 * it is reachable only through the exit flow, which creates the exit record. Leaving EXITED
 * happens only when HR marks the person as joined again (re-joining, decision 2026-10-25).
 * Finer probation/leave rules remain pending product approval (OD-015).
 */
export const EMPLOYEE_STATUS_TRANSITIONS: Record<EmployeeStatus, EmployeeStatus[]> = {
  [EmployeeStatus.PROBATION]: [EmployeeStatus.ACTIVE, EmployeeStatus.ON_LEAVE],
  [EmployeeStatus.ACTIVE]: [EmployeeStatus.PROBATION, EmployeeStatus.ON_LEAVE],
  [EmployeeStatus.ON_LEAVE]: [EmployeeStatus.PROBATION, EmployeeStatus.ACTIVE],
  [EmployeeStatus.EXITED]: [],
};

/**
 * Separation of duties: staff never change their own employment record (status,
 * reporting line, exit, onboarding verification or direct creation).
 */
function assertNotOwnEmployeeRecord(actor: AuthenticatedUser, recordUserId: string): void {
  if (actor.id === recordUserId) {
    throw new ForbiddenError("You cannot change your own employment record.");
  }
}

/**
 * Free-text staff notes must not carry the payroll payout block: that data is written
 * only by the payroll module, which requires `canPayroll` and writes an audit entry.
 */
function sanitizeStaffNotes(notes: string | null | undefined): string | null {
  const trimmed = notes?.trim();
  if (!trimmed) return null;
  if (containsPayoutProfileMarker(trimmed)) {
    throw new ValidationError(
      "Internal notes cannot contain payroll payout data. Use the Payroll module to manage payout profiles."
    );
  }
  return trimmed;
}

/** Offer statuses that are still open: joining as an intern would leave them dangling. */
const PENDING_OFFER_STATUSES: OfferStatus[] = [OfferStatus.DRAFT, OfferStatus.EXTENDED];

/** Result of an intern "Mark as joined". */
export interface InternJoiningResult {
  employeeId: string;
  applicationId: string;
  enrollmentId: string;
  /** The first progress review, scheduled `reviewAfterMonths` after the joining date. */
  reviewId: string;
  /** True when an exited record was reused (same row and employee code). */
  rejoined: boolean;
}

/**
 * "Mark as joined" records that the person has already joined, so the joining date may not
 * lie in the future (see `isFutureJoiningDate` for the time-zone tolerance).
 */
function parseJoiningDate(value: string): Date {
  const joiningDate = new Date(value);
  if (Number.isNaN(joiningDate.getTime())) {
    throw new ValidationError("A valid joining date is required.");
  }
  if (isFutureJoiningDate(joiningDate)) {
    throw new ValidationError(
      "The joining date cannot be in the future. Mark the person as joined on or after their first day."
    );
  }
  return joiningDate;
}

/** The initial status is an explicit HR choice; anything other than ACTIVE / PROBATION is rejected. */
function assertJoiningInitialStatus(status: EmployeeStatus): void {
  if (!(JOINING_INITIAL_STATUSES as readonly EmployeeStatus[]).includes(status)) {
    throw new ValidationError("The initial employment status must be ACTIVE or PROBATION.");
  }
}

/** Fields of an existing employee record that a joining needs to inspect. */
const EXISTING_RECORD_SELECT = {
  id: true,
  employeeCode: true,
  status: true,
  employmentType: true,
} satisfies Prisma.EmployeeSelect;

type ExistingEmployeeRecord = Prisma.EmployeeGetPayload<{ select: typeof EXISTING_RECORD_SELECT }>;

/**
 * Re-joining (product-owner decision 2026-10-25): a person whose record is EXITED re-joins
 * through normal hiring with the same account, and the same Employee row and employee code
 * are reused (a new employment period starts). Returns that record, or null for a first
 * joining. A current record (ACTIVE / PROBATION / ON_LEAVE) blocks a second joining.
 */
function resolveJoiningRecord(
  personName: string,
  profile: ExistingEmployeeRecord | null | undefined,
  employeeCode: string
): ExistingEmployeeRecord | null {
  if (!profile) return null;
  if (profile.status !== EmployeeStatus.EXITED) {
    throw new ConflictError(
      `${personName} already has an active employee record (${profile.employeeCode}). Record their exit before marking a new joining.`
    );
  }
  if (employeeCode !== profile.employeeCode) {
    throw new ValidationError(
      `${personName} is re-joining, so their existing employee code ${profile.employeeCode} is kept.`
    );
  }
  return profile;
}

/** Re-throws unique-constraint races (employee code, user, application) as a conflict. */
function rethrowJoiningConflict(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new ConflictError(
      "An employee record with this code, person or application was created at the same time. Reload and try again."
    );
  }
  throw error;
}

// -----------------------------------------------------------------------------
// Read-path bounds, selects and projections (shared by the composite detail loader and the
// split loaders so the confidentiality rules live in exactly one place).
// -----------------------------------------------------------------------------

/** Directory rows per page by default; `MAX_LIST_PAGE_SIZE` is the hard ceiling. */
export const DIRECTORY_PAGE_SIZE = 25;
export const MAX_LIST_PAGE_SIZE = 50;
/** Reporting-manager picker ceiling; callers narrow with `search` beyond that. */
export const REPORTING_MANAGER_OPTIONS_LIMIT = 100;
/** Newest history rows / documents shown on a record. */
export const EMPLOYEE_HISTORY_LIMIT = 50;
export const EMPLOYEE_DOCUMENT_LIMIT = 50;
/** Direct reports listed on a record (the full count is returned separately). */
const DIRECT_REPORTS_LIMIT = 50;
const MAX_SEARCH_LENGTH = 100;

interface EmployeeReadAccess {
  isSelf: boolean;
  isStaffAdmin: boolean;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/** 1-based page and bounded page size; `skip` is derived from both. */
function normalizePaging(
  query: { page?: number; pageSize?: number },
  defaultPageSize: number
): { page: number; pageSize: number; skip: number } {
  const page = clampInt(query.page ?? 1, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = clampInt(query.pageSize ?? defaultPageSize, 1, MAX_LIST_PAGE_SIZE);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function buildDirectoryWhere(filters: EmployeeDirectoryFilters): Prisma.EmployeeWhereInput {
  const where: Prisma.EmployeeWhereInput = {};

  if (filters.department) {
    where.department = filters.department;
  }
  if (filters.status) {
    where.status = filters.status;
  }

  const term = filters.search?.trim().slice(0, MAX_SEARCH_LENGTH);
  if (term) {
    where.OR = [
      { employeeCode: { contains: term, mode: "insensitive" } },
      { designation: { contains: term, mode: "insensitive" } },
      { department: { contains: term, mode: "insensitive" } },
      { user: { name: { contains: term, mode: "insensitive" } } },
      { user: { email: { contains: term, mode: "insensitive" } } },
    ];
  }
  return where;
}

const managerSelect = {
  id: true,
  employeeCode: true,
  designation: true,
  user: { select: { name: true } },
} satisfies Prisma.EmployeeSelect;

/** Directory columns only: confidential fields are never selected here. */
const directoryItemSelect = {
  id: true,
  employeeCode: true,
  department: true,
  designation: true,
  joiningDate: true,
  status: true,
  employmentType: true,
  user: { select: { name: true, email: true, image: true } },
  manager: { select: managerSelect },
} satisfies Prisma.EmployeeSelect;

type DirectoryRow = Prisma.EmployeeGetPayload<{ select: typeof directoryItemSelect }>;

function toDirectoryItem(emp: DirectoryRow): PublicEmployeeDirectoryItem {
  return {
    id: emp.id,
    employeeCode: emp.employeeCode,
    name: emp.user.name,
    email: emp.user.email,
    department: emp.department,
    designation: emp.designation,
    joiningDate: emp.joiningDate,
    status: emp.status,
    employmentType: emp.employmentType,
    avatar: emp.user.image,
    manager: emp.manager
      ? {
          id: emp.manager.id,
          employeeCode: emp.manager.employeeCode,
          name: emp.manager.user.name,
          designation: emp.manager.designation,
        }
      : null,
  };
}

const employeeCoreSelect = {
  ...directoryItemSelect,
  user: { select: { id: true, name: true, email: true, image: true } },
  personalPhone: true,
  emergencyContact: true,
  internalNotes: true,
  onboardingChecklist: true,
  directReports: {
    select: {
      id: true,
      employeeCode: true,
      designation: true,
      department: true,
      user: { select: { name: true } },
    },
    orderBy: { employeeCode: "asc" },
    take: DIRECT_REPORTS_LIMIT,
  },
  _count: { select: { directReports: true } },
  application: {
    select: {
      id: true,
      referenceCode: true,
      opening: { select: { title: true } },
    },
  },
} satisfies Prisma.EmployeeSelect;

type EmployeeCoreRow = Prisma.EmployeeGetPayload<{ select: typeof employeeCoreSelect }>;

const employmentHistorySelect = {
  id: true,
  changeType: true,
  previousValue: true,
  newValue: true,
  effectiveDate: true,
  remarks: true,
  changedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.EmploymentHistorySelect;

const employeeDocumentSelect = {
  id: true,
  documentType: true,
  title: true,
  storageKey: true,
  mimeType: true,
  fileSizeBytes: true,
  isConfidential: true,
  uploadedAt: true,
  uploadedBy: { select: { id: true, name: true } },
} satisfies Prisma.EmployeeDocumentSelect;

const exitRecordSelect = {
  id: true,
  periodId: true,
  resignationDate: true,
  lastWorkingDate: true,
  reason: true,
  clearanceChecklist: true,
  exitInterviewNotes: true,
  status: true,
  processedBy: { select: { id: true, name: true } },
} satisfies Prisma.EmployeeExitRecordSelect;

const employmentPeriodSelect = {
  id: true,
  employmentType: true,
  designation: true,
  department: true,
  startDate: true,
  endDate: true,
  startReason: true,
  endReason: true,
} satisfies Prisma.EmploymentPeriodSelect;

type EmploymentHistoryRow = Prisma.EmploymentHistoryGetPayload<{ select: typeof employmentHistorySelect }>;
type EmployeeDocumentRow = Prisma.EmployeeDocumentGetPayload<{ select: typeof employeeDocumentSelect }>;
type ExitRecordRow = Prisma.EmployeeExitRecordGetPayload<{ select: typeof exitRecordSelect }>;
type EmploymentPeriodRow = Prisma.EmploymentPeriodGetPayload<{ select: typeof employmentPeriodSelect }>;

interface EmployeeHistoryRows {
  employmentHistories: EmploymentHistoryRow[];
  exitRecords: ExitRecordRow[];
  employmentPeriods: EmploymentPeriodRow[];
}

/**
 * Core projection. Phone and emergency contact are visible to staff admins and the person
 * themselves (both already authorized); internal staff notes are never shown to the employee,
 * and the payroll payout block inside them is only ever shown in the payroll module.
 */
function projectEmployeeCore(emp: EmployeeCoreRow, access: EmployeeReadAccess): EmployeeDetailCore {
  const { isStaffAdmin } = access;
  return {
    ...toDirectoryItem(emp),
    personalPhone: emp.personalPhone,
    emergencyContact: (emp.emergencyContact as unknown as EmergencyContact) || null,
    internalNotes: isStaffAdmin ? stripPayoutProfile(emp.internalNotes) : null,
    application: emp.application
      ? {
          id: emp.application.id,
          referenceCode: emp.application.referenceCode,
          openingTitle: emp.application.opening.title,
        }
      : null,
    onboardingChecklist: (emp.onboardingChecklist as unknown as OnboardingChecklistItem[]) || null,
    directReports: emp.directReports.map((r) => ({
      id: r.id,
      employeeCode: r.employeeCode,
      name: r.user.name,
      designation: r.designation,
      department: r.department,
    })),
    directReportCount: emp._count?.directReports ?? emp.directReports.length,
  };
}

/** Exit interview notes are staff-only. */
function projectEmployeeHistory(rows: EmployeeHistoryRows, access: EmployeeReadAccess): EmployeeHistory {
  const { isStaffAdmin } = access;
  return {
    employmentHistories: rows.employmentHistories.map((h) => ({
      id: h.id,
      changeType: h.changeType,
      previousValue: h.previousValue,
      newValue: h.newValue,
      effectiveDate: h.effectiveDate,
      remarks: h.remarks,
      changedBy: h.changedBy,
    })),
    exitRecords: rows.exitRecords.map((x) => ({
      id: x.id,
      periodId: x.periodId,
      resignationDate: x.resignationDate,
      lastWorkingDate: x.lastWorkingDate,
      reason: x.reason,
      clearanceChecklist: x.clearanceChecklist as Record<string, unknown> | null,
      exitInterviewNotes: isStaffAdmin ? x.exitInterviewNotes : null,
      status: x.status,
      processedBy: x.processedBy,
    })),
    employmentPeriods: rows.employmentPeriods.map((p) => ({
      id: p.id,
      employmentType: p.employmentType,
      designation: p.designation,
      department: p.department,
      startDate: p.startDate,
      endDate: p.endDate,
      startReason: p.startReason,
      endReason: p.endReason,
    })),
  };
}

/** Confidential documents are staff-only, whichever query produced the rows. */
function projectEmployeeDocuments(rows: EmployeeDocumentRow[], access: EmployeeReadAccess): EmployeeDocumentItem[] {
  return rows
    .filter((d) => access.isStaffAdmin || !d.isConfidential)
    .map((d) => ({
      id: d.id,
      documentType: d.documentType,
      title: d.title,
      storageKey: d.storageKey,
      mimeType: d.mimeType,
      fileSizeBytes: d.fileSizeBytes,
      isConfidential: d.isConfidential,
      uploadedAt: d.uploadedAt,
      uploadedBy: d.uploadedBy,
    }));
}

export class EmployeeService {
  /**
   * Employee records management: HR/Admin role plus the canEmployees module permission.
   */
  private async assertAdminAccess(user: AuthenticatedUser): Promise<void> {
    const isAuthorized = user.roles.some((r) => EMPLOYEE_ADMIN_ROLES.includes(r));
    if (!isAuthorized) {
      throw new ForbiddenError(
        "Employee records management is restricted to authorized HR and Administrators."
      );
    }
    await assertPermission(user, "canEmployees");
  }

  private async isEmployeeAdmin(user: AuthenticatedUser): Promise<boolean> {
    if (!user.roles.some((r) => EMPLOYEE_ADMIN_ROLES.includes(r))) {
      return false;
    }
    return hasPermission(user, "canEmployees");
  }

  /**
   * Validates that a proposed reporting manager exists and is not exited.
   */
  private async assertValidManager(
    tx: Prisma.TransactionClient,
    managerId: string
  ): Promise<{ id: string; employeeCode: string; managerId: string | null }> {
    const manager = await tx.employee.findUnique({
      where: { id: managerId },
      select: { id: true, employeeCode: true, managerId: true, status: true },
    });
    if (!manager) {
      throw new NotFoundError("Assigned manager not found.");
    }
    if (manager.status === EmployeeStatus.EXITED) {
      throw new ValidationError("Cannot assign an exited employee as reporting manager.");
    }
    return manager;
  }

  /**
   * Hierarchy cycle detection: the employee must not already be an ancestor of the manager.
   * Runs inside the caller's transaction.
   */
  private async assertNoReportingCycle(
    tx: Prisma.TransactionClient,
    employee: { id: string; employeeCode: string },
    manager: { id: string; employeeCode: string; managerId: string | null }
  ): Promise<void> {
    if (manager.id === employee.id) {
      throw new ValidationError("An employee cannot be assigned as their own reporting manager.");
    }
    let currentManagerId: string | null = manager.managerId;
    const visited = new Set<string>([manager.id]);

    while (currentManagerId) {
      if (currentManagerId === employee.id) {
        throw new ValidationError(
          `Circular reporting hierarchy detected: Employee ${employee.employeeCode} cannot report to ${manager.employeeCode} because ${manager.employeeCode} already reports up to ${employee.employeeCode}.`
        );
      }
      if (visited.has(currentManagerId)) {
        break; // Cycle in existing data, stop traversal
      }
      visited.add(currentManagerId);

      const parent: { managerId: string | null } | null = await tx.employee.findUnique({
        where: { id: currentManagerId },
        select: { managerId: true },
      });
      currentManagerId = parent?.managerId ?? null;
    }
  }

  /** A new employee code must not belong to anyone (the unique constraint also guards races). */
  private async assertEmployeeCodeFree(tx: Prisma.TransactionClient, employeeCode: string): Promise<void> {
    const existingCode = await tx.employee.findUnique({
      where: { employeeCode },
      select: { id: true },
    });
    if (existingCode) {
      throw new ValidationError(`Employee code '${employeeCode}' is already assigned to another employee.`);
    }
  }

  /**
   * Re-joining: reuses the exited row (same id and employee code). The conditional write fails
   * if the record left EXITED concurrently. Confidential details recorded earlier are kept.
   */
  private async reactivateExitedEmployee(
    tx: Prisma.TransactionClient,
    employeeId: string,
    data: {
      employmentType: EmploymentType;
      designation: string;
      department: string;
      status: EmployeeStatus;
      managerId: string | null;
      joiningDate: Date;
      applicationId: string;
    }
  ): Promise<void> {
    const reactivated = await tx.employee.updateMany({
      where: { id: employeeId, status: EmployeeStatus.EXITED },
      data,
    });
    if (reactivated.count !== 1) {
      throw new ConflictError("The employee record was changed by another action. Reload and try again.");
    }
  }

  /**
   * Full-time "Mark as joined": records that a candidate with an accepted offer has joined.
   * STRICT GATING:
   * 1. Requires ADMIN or HR role and the canEmployees permission.
   * 2. Requires an ACCEPTED job offer and application status OFFER_ACCEPTED.
   * 3. A current (non-exited) employee record blocks the joining; an EXITED record is reused
   *    with the same employee code (re-joining) and a REJOINED employment period starts.
   * 4. The actor must not be the candidate (separation of duties).
   * 5. The joining date must not be in the future (the person has joined).
   * Opens an employment period, grants the EMPLOYEE role with a fresh `assignedAt` and queues
   * the EMPLOYEE_JOINED email (`isRejoin: true` for a returning person).
   */
  async createEmployeeFromApplication(
    user: AuthenticatedUser,
    input: CreateEmployeeFromApplicationInput
  ): Promise<ConfidentialEmployeeDetail> {
    await this.assertAdminAccess(user);
    const joiningDate = parseJoiningDate(input.joiningDate);
    assertJoiningInitialStatus(input.initialStatus);
    const employeeCode = input.employeeCode.trim();
    const department = input.department.trim();
    const designation = input.designation.trim();

    let joinedEmployeeId: string;
    try {
      joinedEmployeeId = await prisma.$transaction(async (tx) => {
        const application = await tx.application.findUnique({
          where: { id: input.applicationId },
          include: {
            candidate: {
              include: {
                user: {
                  include: {
                    employeeProfile: { select: EXISTING_RECORD_SELECT },
                  },
                },
              },
            },
            jobOffer: { select: { id: true, status: true } },
          },
        });

        if (!application) {
          throw new NotFoundError("Application record not found.");
        }

        // Separation of duties: staff can never hire themselves.
        assertNotOwnApplication(user, application.candidate.user.id);

        // STRICT CHECK 1: The candidate must have explicitly accepted a job offer.
        if (!application.jobOffer || application.jobOffer.status !== OfferStatus.ACCEPTED) {
          throw new ValidationError(
            "Cannot mark as joined: the candidate has not accepted a job offer for this application."
          );
        }

        // STRICT CHECK 2: Application status must be OFFER_ACCEPTED
        if (application.status !== ApplicationStatus.OFFER_ACCEPTED) {
          throw new ValidationError(
            `Cannot mark as joined: the application status is currently '${application.status}'. A candidate can only join after their job offer is explicitly accepted ('OFFER_ACCEPTED').`
          );
        }

        const candidateUser = application.candidate.user;

        // STRICT CHECK 3: no current employee record; an exited one is reused (re-joining).
        const existing = resolveJoiningRecord(candidateUser.name, candidateUser.employeeProfile, employeeCode);
        if (!existing) {
          await this.assertEmployeeCodeFree(tx, employeeCode);
        }

        // STRICT CHECK 4: Manager existence (and no reporting cycle for a returning person)
        if (input.managerId) {
          const manager = await this.assertValidManager(tx, input.managerId);
          if (existing) {
            await this.assertNoReportingCycle(tx, existing, manager);
          }
        }

        // Conditional transition: fails if the application stage changed concurrently.
        const transitioned = await tx.application.updateMany({
          where: { id: application.id, status: ApplicationStatus.OFFER_ACCEPTED },
          data: { status: ApplicationStatus.HIRED },
        });
        if (transitioned.count !== 1) {
          throw new ConflictError(
            "The application stage was changed by another action. Reload and try again."
          );
        }

        const now = new Date();
        const isRejoin = existing !== null;

        // 1. Employee record: a new row, or the exited row reused with the same code.
        let employeeId: string;
        if (existing) {
          await this.reactivateExitedEmployee(tx, existing.id, {
            employmentType: EmploymentType.FULL_TIME,
            designation,
            department,
            status: input.initialStatus,
            managerId: input.managerId || null,
            joiningDate,
            applicationId: application.id,
          });
          employeeId = existing.id;
        } else {
          const created = await tx.employee.create({
            data: {
              userId: candidateUser.id,
              employeeCode,
              department,
              designation,
              joiningDate,
              status: input.initialStatus,
              employmentType: EmploymentType.FULL_TIME,
              managerId: input.managerId || null,
              personalPhone: input.personalPhone?.trim() || null,
              emergencyContact: input.emergencyContact
                ? (input.emergencyContact as unknown as Prisma.InputJsonValue)
                : undefined,
              internalNotes: sanitizeStaffNotes(input.internalNotes),
              applicationId: application.id,
              onboardingChecklist: DEFAULT_ONBOARDING_CHECKLIST as unknown as Prisma.InputJsonValue,
            },
          });
          employeeId = created.id;
        }

        // 2. Employment period for this joining
        const period = await openEmploymentPeriod(tx, {
          employeeId,
          employmentType: EmploymentType.FULL_TIME,
          designation,
          department,
          startDate: joiningDate,
          startReason: isRejoin ? EmploymentPeriodStartReason.REJOINED : EmploymentPeriodStartReason.JOINED,
          applicationId: application.id,
          createdById: user.id,
        });

        // 3. Employment history entry
        await tx.employmentHistory.create({
          data: {
            employeeId,
            changeType: isRejoin ? "REJOINED" : "HIRED",
            previousValue: isRejoin ? EmployeeStatus.EXITED : null,
            newValue: input.initialStatus,
            effectiveDate: joiningDate,
            remarks: `${isRejoin ? "Re-joined" : "Marked as joined"} (full-time) via application ${application.referenceCode} for ${designation} (${department})`,
            changedById: user.id,
          },
        });

        // 4. Application stage history (status already moved to HIRED above)
        await tx.applicationStatusHistory.create({
          data: {
            applicationId: application.id,
            fromStatus: ApplicationStatus.OFFER_ACCEPTED,
            toStatus: ApplicationStatus.HIRED,
            actorId: user.id,
            internalNotes: isRejoin
              ? `Marked as re-joined. Existing employee record ${employeeCode} reused; a new employment period started.`
              : `Marked as joined. Employee record created with code ${employeeCode}. Onboarding initiated.`,
            candidateMessage: isRejoin
              ? `Welcome back to GARA Innovation! You have re-joined as an employee (${employeeCode}). Your employee home, attendance, leave and payslips are available in your portal again.`
              : `Welcome to GARA Innovation! You have joined as an employee (${employeeCode}). Your employee home, attendance, leave and payslips are now available in your portal.`,
          },
        });

        // 5. Grant the EMPLOYEE role (fresh assignedAt drives the portal upgrade banner). A
        //    returning former intern no longer holds the INTERN role.
        await grantJoiningRole(tx, candidateUser.id, Role.EMPLOYEE, user.id, now);
        if (isRejoin) {
          await revokeJoiningRole(tx, candidateUser.id, Role.INTERN);
        }

        // 6. Welcome notification in outbox
        await tx.notificationOutbox.create({
          data: {
            recipientEmail: candidateUser.email,
            templateName: "EMPLOYEE_JOINED",
            payload: {
              employeeName: candidateUser.name,
              employeeCode,
              department,
              designation,
              joiningDate: joiningDate.toISOString(),
              ...(isRejoin ? { isRejoin: true } : {}),
            },
            status: "PENDING",
          },
        });

        // 7. Audit Log
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            actorRole: user.roles[0] ?? "HR",
            action: "MARK_EMPLOYEE_JOINED",
            resourceType: "EMPLOYEE",
            resourceId: employeeId,
            diffPayload: {
              applicationId: application.id,
              jobOfferId: application.jobOffer.id,
              employeeCode,
              userId: candidateUser.id,
              joiningDate: joiningDate.toISOString(),
              initialStatus: input.initialStatus,
              employmentType: EmploymentType.FULL_TIME,
              applicationFromStatus: ApplicationStatus.OFFER_ACCEPTED,
              applicationToStatus: ApplicationStatus.HIRED,
              roleGranted: Role.EMPLOYEE,
              isRejoin,
              periodId: period.id,
              ...(existing ? { previousEmploymentType: existing.employmentType } : {}),
            },
          },
        });

        return employeeId;
      });
    } catch (error) {
      rethrowJoiningConflict(error);
    }

    return this.getEmployeeDetail(user, joinedEmployeeId);
  }

  /**
   * Intern "Mark as joined" (internship step 2): after the supervised evaluation was recorded as
   * PASSED, HR records that the person has joined. In one transaction with conditional writes it
   * creates the INTERN employee record (or reuses an exited one with the same code), opens the
   * employment period, schedules the first progress review (`reviewAfterMonths` after joining),
   * moves the application EVALUATION_SELECTED → HIRED, writes stage, employment and audit
   * history, grants the INTERN role with a fresh `assignedAt` and queues the INTERN_JOINED email.
   * Gated: ADMIN, or HR with canEmployees; never for one's own enrollment.
   */
  async createEmployeeFromInternship(
    user: AuthenticatedUser,
    input: MarkInternJoinedInput
  ): Promise<InternJoiningResult> {
    await this.assertAdminAccess(user);
    const joiningDate = parseJoiningDate(input.joiningDate);
    assertJoiningInitialStatus(input.initialStatus);
    if (!isReviewPeriodMonths(input.reviewAfterMonths)) {
      throw new ValidationError("Choose when the progress review takes place (after 3 or 6 months).");
    }
    const reviewAfterMonths = input.reviewAfterMonths;
    const employeeCode = input.employeeCode.trim();
    const department = input.department.trim();
    const designation = input.designation.trim();

    try {
      return await prisma.$transaction(async (tx) => {
        const enrollment = await tx.internshipEnrollment.findUnique({
          where: { id: input.enrollmentId },
          select: {
            id: true,
            userId: true,
            status: true,
            application: {
              select: {
                id: true,
                referenceCode: true,
                status: true,
                opening: { select: { title: true, type: true } },
                jobOffer: { select: { status: true } },
              },
            },
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                employeeProfile: { select: EXISTING_RECORD_SELECT },
              },
            },
          },
        });

        if (!enrollment) {
          throw new NotFoundError("Evaluation enrollment not found.");
        }

        // Separation of duties: staff never mark themselves as joined.
        if (enrollment.userId === user.id) {
          throw new ForbiddenError("You cannot mark your own internship as joined.");
        }

        const application = enrollment.application;
        if (application.opening.type !== OpeningType.INTERNSHIP) {
          throw new ValidationError("Only internship applications can join as an intern.");
        }

        if (enrollment.status !== EvaluationStatus.PASSED) {
          throw new ValidationError(
            `Only an evaluation recorded as PASSED can be marked as joined. Current evaluation status: ${enrollment.status}.`
          );
        }

        if (application.status === ApplicationStatus.HIRED) {
          throw new ConflictError("This intern has already been marked as joined.");
        }
        if (application.status !== ApplicationStatus.EVALUATION_SELECTED) {
          throw new ValidationError(
            `Cannot mark as joined: the application is in stage ${application.status}. Intern joining starts from EVALUATION_SELECTED.`
          );
        }

        if (application.jobOffer && PENDING_OFFER_STATUSES.includes(application.jobOffer.status)) {
          throw new ValidationError(
            "This application has a pending job offer. Revoke the offer before marking the intern as joined."
          );
        }

        const existing = resolveJoiningRecord(enrollment.user.name, enrollment.user.employeeProfile, employeeCode);
        if (!existing) {
          await this.assertEmployeeCodeFree(tx, employeeCode);
        }

        if (input.managerId) {
          const manager = await this.assertValidManager(tx, input.managerId);
          if (existing) {
            await this.assertNoReportingCycle(tx, existing, manager);
          }
        }

        // Conditional transition: the application must still be EVALUATION_SELECTED and the
        // enrollment PASSED, otherwise a concurrent action won and nothing is written.
        const transitioned = await tx.application.updateMany({
          where: {
            id: application.id,
            status: ApplicationStatus.EVALUATION_SELECTED,
            enrollment: { is: { status: EvaluationStatus.PASSED } },
          },
          data: { status: ApplicationStatus.HIRED },
        });
        if (transitioned.count !== 1) {
          throw new ConflictError(
            "The application or evaluation was changed by another action. Reload and try again."
          );
        }

        const now = new Date();
        const isRejoin = existing !== null;

        let employeeId: string;
        if (existing) {
          await this.reactivateExitedEmployee(tx, existing.id, {
            employmentType: EmploymentType.INTERN,
            designation,
            department,
            status: input.initialStatus,
            managerId: input.managerId || null,
            joiningDate,
            applicationId: application.id,
          });
          // Reviews of an earlier internship never carry over to the new period.
          await tx.conversionReview.updateMany({
            where: { employeeId: existing.id, status: ConversionReviewStatus.SCHEDULED },
            data: { status: ConversionReviewStatus.CANCELLED },
          });
          employeeId = existing.id;
        } else {
          const created = await tx.employee.create({
            data: {
              userId: enrollment.userId,
              employeeCode,
              department,
              designation,
              joiningDate,
              status: input.initialStatus,
              employmentType: EmploymentType.INTERN,
              managerId: input.managerId || null,
              applicationId: application.id,
              onboardingChecklist: DEFAULT_ONBOARDING_CHECKLIST as unknown as Prisma.InputJsonValue,
            },
          });
          employeeId = created.id;
        }

        const period = await openEmploymentPeriod(tx, {
          employeeId,
          employmentType: EmploymentType.INTERN,
          designation,
          department,
          startDate: joiningDate,
          startReason: isRejoin ? EmploymentPeriodStartReason.REJOINED : EmploymentPeriodStartReason.JOINED,
          applicationId: application.id,
          createdById: user.id,
        });

        // Product-owner decision (2026-10-25): the first progress review takes place 3 or 6
        // months after joining, as chosen by HR.
        const review = await tx.conversionReview.create({
          data: {
            employeeId,
            periodId: period.id,
            reviewPeriodMonths: reviewAfterMonths,
            scheduledFor: firstReviewDate(joiningDate, reviewAfterMonths),
            status: ConversionReviewStatus.SCHEDULED,
            createdById: user.id,
          },
          select: { id: true, scheduledFor: true },
        });

        await tx.employmentHistory.create({
          data: {
            employeeId,
            changeType: isRejoin ? "INTERN_REJOINED" : "INTERN_JOINED",
            previousValue: isRejoin ? EmployeeStatus.EXITED : null,
            newValue: input.initialStatus,
            effectiveDate: joiningDate,
            remarks: `${isRejoin ? "Re-joined" : "Marked as joined"} (intern) via application ${application.referenceCode} after a PASSED evaluation, as ${designation} (${department}). Progress review after ${reviewAfterMonths} months (${calendarDayKey(review.scheduledFor)}).`,
            changedById: user.id,
          },
        });

        await tx.applicationStatusHistory.create({
          data: {
            applicationId: application.id,
            fromStatus: ApplicationStatus.EVALUATION_SELECTED,
            toStatus: ApplicationStatus.HIRED,
            actorId: user.id,
            internalNotes: isRejoin
              ? `Marked as re-joined as an intern. Existing employee record ${employeeCode} reused; a new employment period started.`
              : `Marked as joined as an intern. Employee record created with code ${employeeCode}.`,
            candidateMessage: isRejoin
              ? "Welcome back to GARA Innovation! You have re-joined as an intern. Your intern workspace, attendance, leave, payslips, ID card and certificate are available in your portal again."
              : "Welcome to GARA Innovation! You have joined as an intern. Your intern workspace, attendance, leave, payslips, ID card and certificate are now available in your portal.",
          },
        });

        await grantJoiningRole(tx, enrollment.userId, Role.INTERN, user.id, now);
        if (isRejoin) {
          await revokeJoiningRole(tx, enrollment.userId, Role.EMPLOYEE);
        }

        await tx.notificationOutbox.create({
          data: {
            recipientEmail: enrollment.user.email,
            templateName: "INTERN_JOINED",
            payload: {
              recipientName: enrollment.user.name,
              employeeCode,
              department,
              designation,
              openingTitle: application.opening.title,
              joiningDate: joiningDate.toISOString(),
              ...(isRejoin ? { isRejoin: true } : {}),
            },
            status: "PENDING",
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            actorRole: user.roles[0] ?? "HR",
            action: "MARK_INTERN_JOINED",
            resourceType: "EMPLOYEE",
            resourceId: employeeId,
            diffPayload: {
              enrollmentId: enrollment.id,
              applicationId: application.id,
              userId: enrollment.userId,
              employeeCode,
              joiningDate: joiningDate.toISOString(),
              initialStatus: input.initialStatus,
              employmentType: EmploymentType.INTERN,
              managerId: input.managerId || null,
              applicationFromStatus: ApplicationStatus.EVALUATION_SELECTED,
              applicationToStatus: ApplicationStatus.HIRED,
              roleGranted: Role.INTERN,
              isRejoin,
              periodId: period.id,
              reviewId: review.id,
              reviewAfterMonths,
              reviewScheduledFor: review.scheduledFor.toISOString(),
              ...(existing ? { previousEmploymentType: existing.employmentType } : {}),
            },
          },
        });

        return {
          employeeId,
          applicationId: application.id,
          enrollmentId: enrollment.id,
          reviewId: review.id,
          rejoined: isRejoin,
        };
      });
    } catch (error) {
      rethrowJoiningConflict(error);
    }
  }

  /**
   * Directly creates an employee record for an existing platform user, bypassing the
   * application/offer gate. Restricted to ADMIN, requires a written justification and is
   * audit logged. Whether this path should exist at all is pending a product decision.
   */
  async createDirectEmployee(
    user: AuthenticatedUser,
    input: DirectCreateEmployeeInput
  ): Promise<ConfidentialEmployeeDetail> {
    if (!user.roles.includes(Role.ADMIN)) {
      throw new ForbiddenError(
        "Creating an employee record without an accepted offer is restricted to Administrators."
      );
    }
    await assertPermission(user, "canEmployees");

    assertNotOwnEmployeeRecord(user, input.userId);

    const justification = input.justification.trim();
    if (justification.length < 10) {
      throw new ValidationError("A justification of at least 10 characters is required.");
    }

    const created = await prisma.$transaction(async (tx) => {
      const targetUser = await tx.user.findUnique({
        where: { id: input.userId },
        include: { employeeProfile: true },
      });

      if (!targetUser) {
        throw new NotFoundError("Target user not found.");
      }

      if (targetUser.employeeProfile) {
        throw new ValidationError(
          targetUser.employeeProfile.status === EmployeeStatus.EXITED
            ? `User ${targetUser.name} has an exited employee record (${targetUser.employeeProfile.employeeCode}). A returning person re-joins through hiring, which reuses that record.`
            : `User ${targetUser.name} already has an employee record (${targetUser.employeeProfile.employeeCode}).`
        );
      }

      const existingCode = await tx.employee.findUnique({
        where: { employeeCode: input.employeeCode.trim() },
        select: { id: true },
      });
      if (existingCode) {
        throw new ValidationError(
          `Employee code '${input.employeeCode}' is already in use.`
        );
      }

      if (input.managerId) {
        await this.assertValidManager(tx, input.managerId);
      }

      const employee = await tx.employee.create({
        data: {
          userId: targetUser.id,
          employeeCode: input.employeeCode.trim(),
          department: input.department.trim(),
          designation: input.designation.trim(),
          joiningDate: new Date(input.joiningDate),
          status: input.status ?? EmployeeStatus.PROBATION,
          managerId: input.managerId || null,
          personalPhone: input.personalPhone?.trim() || null,
          emergencyContact: input.emergencyContact
            ? (input.emergencyContact as unknown as Prisma.InputJsonValue)
            : undefined,
          internalNotes: sanitizeStaffNotes(input.internalNotes),
          onboardingChecklist: DEFAULT_ONBOARDING_CHECKLIST as unknown as Prisma.InputJsonValue,
        },
      });

      await openEmploymentPeriod(tx, {
        employeeId: employee.id,
        // Direct creation does not record an employment type (unchanged behaviour).
        employmentType: employee.employmentType,
        designation: employee.designation,
        department: employee.department,
        startDate: employee.joiningDate,
        startReason: EmploymentPeriodStartReason.JOINED,
        applicationId: null,
        createdById: user.id,
      });

      await tx.employmentHistory.create({
        data: {
          employeeId: employee.id,
          changeType: "DIRECT_HIRE",
          previousValue: null,
          newValue: employee.status,
          remarks: `Direct employee creation for ${input.designation}. Justification: ${justification}`,
          changedById: user.id,
        },
      });

      await tx.userRole.upsert({
        where: {
          userId_role: {
            userId: targetUser.id,
            role: Role.EMPLOYEE,
          },
        },
        create: {
          userId: targetUser.id,
          role: Role.EMPLOYEE,
          assignedBy: user.id,
        },
        update: {},
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: Role.ADMIN,
          action: "CREATE_DIRECT_EMPLOYEE",
          resourceType: "EMPLOYEE",
          resourceId: employee.id,
          diffPayload: {
            employeeCode: employee.employeeCode,
            userId: targetUser.id,
            status: employee.status,
            justification,
          },
        },
      });

      return employee;
    });

    return this.getEmployeeDetail(user, created.id);
  }

  // ---------------------------------------------------------------------------
  // Read paths. Every list is bounded and selects only rendered columns; confidential
  // fields (personal phone, emergency contact, internal notes) never leave the detail
  // projection below.
  // ---------------------------------------------------------------------------

  /**
   * One page of the employee directory. Requires canEmployees (ADMIN always passes). Search,
   * filters, paging and the department list all run in PostgreSQL.
   */
  async getEmployeeDirectory(
    user: AuthenticatedUser,
    query: EmployeeDirectoryQuery = {}
  ): Promise<EmployeeDirectoryPage> {
    // ADMIN always passes; staff need the canEmployees module permission.
    await assertPermission(user, "canEmployees");

    const where = buildDirectoryWhere(query);
    const { page, pageSize, skip } = normalizePaging(query, DIRECTORY_PAGE_SIZE);

    const [rows, total, departmentRows] = await Promise.all([
      prisma.employee.findMany({
        where,
        select: directoryItemSelect,
        orderBy: { employeeCode: "asc" },
        skip,
        take: pageSize,
      }),
      prisma.employee.count({ where }),
      prisma.employee.groupBy({ by: ["department"], orderBy: { department: "asc" } }),
    ]);

    return {
      items: rows.map(toDirectoryItem),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      departments: departmentRows.map((row) => row.department),
    };
  }

  /**
   * Active (non-exited) employees that may be chosen as reporting manager in the joining
   * dialogs and on the employee record. Gated like every joining action: HR / Admin with
   * canEmployees. Bounded to REPORTING_MANAGER_OPTIONS_LIMIT rows (narrow with `search`).
   */
  async listReportingManagerOptions(
    user: AuthenticatedUser,
    options: ReportingManagerQuery = {}
  ): Promise<ReportingManagerOption[]> {
    await this.assertAdminAccess(user);

    const term = options.search?.trim().slice(0, MAX_SEARCH_LENGTH);
    const where: Prisma.EmployeeWhereInput = {
      status: { not: EmployeeStatus.EXITED },
      ...(options.excludeEmployeeId ? { id: { not: options.excludeEmployeeId } } : {}),
      ...(term
        ? {
            OR: [
              { employeeCode: { contains: term, mode: "insensitive" } },
              { designation: { contains: term, mode: "insensitive" } },
              { user: { name: { contains: term, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const take = clampInt(options.take ?? REPORTING_MANAGER_OPTIONS_LIMIT, 1, REPORTING_MANAGER_OPTIONS_LIMIT);

    const managers = await prisma.employee.findMany({
      where,
      select: {
        id: true,
        employeeCode: true,
        designation: true,
        user: { select: { name: true } },
      },
      orderBy: { employeeCode: "asc" },
      take,
    });

    return managers.map((m) => ({
      id: m.id,
      employeeCode: m.employeeCode,
      name: m.user.name,
      designation: m.designation,
    }));
  }

  /**
   * Who may read an employee record: HR/Admin with canEmployees, or the employee themselves.
   * Internal notes, exit interview notes and confidential documents are staff-only.
   */
  private async employeeReadAccessFor(
    user: AuthenticatedUser,
    ownerUserId: string
  ): Promise<EmployeeReadAccess> {
    const isSelf = ownerUserId === user.id;
    const isStaffAdmin = await this.isEmployeeAdmin(user);

    if (!isStaffAdmin && !isSelf) {
      throw new ForbiddenError(
        "Access to confidential employee details requires HR, Administrator, or self authorization."
      );
    }
    return { isSelf, isStaffAdmin };
  }

  /** Resolves read access for a record id (one narrow query); throws NotFound / Forbidden. */
  private async resolveEmployeeReadAccess(
    user: AuthenticatedUser,
    employeeId: string
  ): Promise<EmployeeReadAccess> {
    const owner = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { userId: true },
    });
    if (!owner) {
      throw new NotFoundError("Employee record not found.");
    }
    return this.employeeReadAccessFor(user, owner.userId);
  }

  /**
   * Header and profile of one employee record in a single query (the detail page's first
   * paint). Histories and documents stream separately through the loaders below.
   */
  async getEmployeeDetailCore(user: AuthenticatedUser, employeeId: string): Promise<EmployeeDetailCore> {
    const emp = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: employeeCoreSelect,
    });
    if (!emp) {
      throw new NotFoundError("Employee record not found.");
    }
    const access = await this.employeeReadAccessFor(user, emp.user.id);
    return projectEmployeeCore(emp, access);
  }

  /**
   * Employment periods, exit records and the history timeline of one record. Same access
   * rules as the core; exit interview notes are staff-only.
   */
  async getEmployeeHistory(user: AuthenticatedUser, employeeId: string): Promise<EmployeeHistory> {
    const access = await this.resolveEmployeeReadAccess(user, employeeId);

    const [employmentHistories, exitRecords, employmentPeriods] = await Promise.all([
      prisma.employmentHistory.findMany({
        where: { employeeId },
        select: employmentHistorySelect,
        orderBy: { effectiveDate: "desc" },
        take: EMPLOYEE_HISTORY_LIMIT,
      }),
      prisma.employeeExitRecord.findMany({
        where: { employeeId },
        select: exitRecordSelect,
        orderBy: { lastWorkingDate: "desc" },
      }),
      prisma.employmentPeriod.findMany({
        where: { employeeId },
        select: employmentPeriodSelect,
        orderBy: { startDate: "asc" },
      }),
    ]);

    return projectEmployeeHistory({ employmentHistories, exitRecords, employmentPeriods }, access);
  }

  /**
   * Secure document metadata of one record (newest first, bounded). Confidential documents
   * are filtered in the query for non-staff viewers and again in the projection.
   */
  async getEmployeeDocuments(user: AuthenticatedUser, employeeId: string): Promise<EmployeeDocumentItem[]> {
    const access = await this.resolveEmployeeReadAccess(user, employeeId);

    const documents = await prisma.employeeDocument.findMany({
      where: { employeeId, ...(access.isStaffAdmin ? {} : { isConfidential: false }) },
      select: employeeDocumentSelect,
      orderBy: { uploadedAt: "desc" },
      take: EMPLOYEE_DOCUMENT_LIMIT,
    });

    return projectEmployeeDocuments(documents, access);
  }

  /**
   * Complete employee record (core, documents and history) in one query. Used where the whole
   * projection is needed at once, e.g. the record returned right after a joining. Pages prefer
   * the split loaders above so heavy sections can stream.
   */
  async getEmployeeDetail(
    user: AuthenticatedUser,
    employeeId: string
  ): Promise<ConfidentialEmployeeDetail> {
    const emp = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        ...employeeCoreSelect,
        employmentHistories: {
          select: employmentHistorySelect,
          orderBy: { effectiveDate: "desc" },
          take: EMPLOYEE_HISTORY_LIMIT,
        },
        secureDocuments: {
          select: employeeDocumentSelect,
          orderBy: { uploadedAt: "desc" },
          take: EMPLOYEE_DOCUMENT_LIMIT,
        },
        exitRecords: {
          select: exitRecordSelect,
          orderBy: { lastWorkingDate: "desc" },
        },
        employmentPeriods: {
          select: employmentPeriodSelect,
          orderBy: { startDate: "asc" },
        },
      },
    });

    if (!emp) {
      throw new NotFoundError("Employee record not found.");
    }

    const access = await this.employeeReadAccessFor(user, emp.user.id);

    return {
      ...projectEmployeeCore(emp, access),
      ...projectEmployeeHistory(emp, access),
      secureDocuments: projectEmployeeDocuments(emp.secureDocuments, access),
    };
  }

  /**
   * Updates employee lifecycle status using the explicit transition map.
   * EXITED cannot be set here: it is reachable only through processEmployeeExit.
   * Gated: HR / Admin with canEmployees.
   */
  async updateEmployeeStatus(
    user: AuthenticatedUser,
    input: UpdateEmployeeStatusInput
  ): Promise<void> {
    await this.assertAdminAccess(user);

    if (input.toStatus === EmployeeStatus.EXITED) {
      throw new ValidationError(
        "EXITED can only be set through the offboarding (exit) flow, which records the exit details."
      );
    }

    await prisma.$transaction(async (tx) => {
      const emp = await tx.employee.findUnique({
        where: { id: input.employeeId },
        select: { id: true, status: true, userId: true },
      });
      if (emp) {
        assertNotOwnEmployeeRecord(user, emp.userId);
      }

      if (!emp) {
        throw new NotFoundError("Employee record not found.");
      }

      if (emp.status === EmployeeStatus.EXITED) {
        throw new ValidationError(
          "Cannot change status: Employee has already EXITED. Exited status is terminal."
        );
      }

      if (emp.status === input.toStatus) {
        throw new ValidationError(`Employee is already in status ${input.toStatus}.`);
      }

      const allowed = EMPLOYEE_STATUS_TRANSITIONS[emp.status] ?? [];
      if (!allowed.includes(input.toStatus)) {
        throw new ValidationError(
          `Invalid status transition from ${emp.status} to ${input.toStatus}. Allowed: ${allowed.join(", ") || "None"}.`
        );
      }

      const updated = await tx.employee.updateMany({
        where: { id: emp.id, status: emp.status },
        data: { status: input.toStatus },
      });
      if (updated.count !== 1) {
        throw new ConflictError("The employee status was changed by another action. Reload and try again.");
      }

      await tx.employmentHistory.create({
        data: {
          employeeId: emp.id,
          changeType: "STATUS_CHANGE",
          previousValue: emp.status,
          newValue: input.toStatus,
          remarks: input.remarks || null,
          changedById: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] ?? "HR",
          action: "UPDATE_EMPLOYEE_STATUS",
          resourceType: "EMPLOYEE",
          resourceId: emp.id,
          diffPayload: {
            fromStatus: emp.status,
            toStatus: input.toStatus,
            remarks: input.remarks ?? null,
          },
        },
      });
    });
  }

  /**
   * Assigns or changes employee reporting manager.
   * Enforces self-assignment prevention and hierarchy cycle detection inside a
   * serializable transaction so concurrent assignments cannot create a cycle.
   * Gated: HR / Admin with canEmployees.
   */
  async assignManager(
    user: AuthenticatedUser,
    input: AssignManagerInput
  ): Promise<void> {
    await this.assertAdminAccess(user);

    await prisma.$transaction(
      async (tx) => {
        const emp = await tx.employee.findUnique({
          where: { id: input.employeeId },
          select: {
            id: true,
            userId: true,
            employeeCode: true,
            managerId: true,
            manager: { select: { employeeCode: true } },
          },
        });

        if (!emp) {
          throw new NotFoundError("Employee record not found.");
        }
        assertNotOwnEmployeeRecord(user, emp.userId);

        if ((input.managerId ?? null) === emp.managerId) {
          throw new ValidationError("This reporting manager is already assigned.");
        }

        let newManagerCode: string | null = null;

        if (input.managerId) {
          if (input.managerId === emp.id) {
            throw new ValidationError("An employee cannot be assigned as their own reporting manager.");
          }

          const targetManager = await this.assertValidManager(tx, input.managerId);
          newManagerCode = targetManager.employeeCode;
          await this.assertNoReportingCycle(tx, emp, targetManager);
        }

        await tx.employee.update({
          where: { id: emp.id },
          data: { managerId: input.managerId },
        });

        // Both values use employee codes so the history reads consistently.
        await tx.employmentHistory.create({
          data: {
            employeeId: emp.id,
            changeType: "MANAGER_CHANGE",
            previousValue: emp.manager?.employeeCode ?? "None",
            newValue: newManagerCode ?? "None",
            remarks: input.remarks || null,
            changedById: user.id,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            actorRole: user.roles[0] ?? "HR",
            action: "ASSIGN_EMPLOYEE_MANAGER",
            resourceType: "EMPLOYEE",
            resourceId: emp.id,
            diffPayload: {
              fromManagerId: emp.managerId,
              toManagerId: input.managerId,
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  /**
   * Updates an employee onboarding checklist item.
   * Checklist items are HR verification steps, so only HR / Admin with canEmployees may
   * change them (employees cannot verify their own items). Optimistic concurrency on
   * `updatedAt` prevents lost updates; every change is audit logged.
   */
  async updateOnboardingChecklist(
    user: AuthenticatedUser,
    input: UpdateOnboardingChecklistInput
  ): Promise<void> {
    await this.assertAdminAccess(user);

    await prisma.$transaction(async (tx) => {
      const emp = await tx.employee.findUnique({
        where: { id: input.employeeId },
        select: { id: true, userId: true, onboardingChecklist: true, updatedAt: true },
      });

      if (!emp) {
        throw new NotFoundError("Employee record not found.");
      }
      assertNotOwnEmployeeRecord(user, emp.userId);

      const currentList: OnboardingChecklistItem[] = Array.isArray(emp.onboardingChecklist)
        ? (emp.onboardingChecklist as unknown as OnboardingChecklistItem[])
        : DEFAULT_ONBOARDING_CHECKLIST;

      const target = currentList.find((item) => item.id === input.itemId);
      if (!target) {
        throw new ValidationError("Unknown onboarding checklist item.");
      }

      const completedAt = input.completed ? new Date().toISOString() : null;
      const updatedList = currentList.map((item) =>
        item.id === input.itemId ? { ...item, completed: input.completed, completedAt } : item
      );

      const updated = await tx.employee.updateMany({
        where: { id: emp.id, updatedAt: emp.updatedAt },
        data: {
          onboardingChecklist: updatedList as unknown as Prisma.InputJsonValue,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictError("The checklist was changed by another action. Reload and try again.");
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] ?? "HR",
          action: "UPDATE_ONBOARDING_CHECKLIST_ITEM",
          resourceType: "EMPLOYEE",
          resourceId: emp.id,
          diffPayload: {
            itemId: input.itemId,
            fromCompleted: target.completed,
            toCompleted: input.completed,
          },
        },
      });
    });
  }

  /**
   * Registers secure document metadata for an employee record.
   * Policy-gated (OD-013): no storage provider is approved, so metadata pointing to a
   * file that was never stored must not be recorded.
   */
  async addEmployeeDocument(
    user: AuthenticatedUser,
    input: UploadEmployeeDocumentInput
  ): Promise<void> {
    await this.assertAdminAccess(user);

    const emp = await prisma.employee.findUnique({
      where: { id: input.employeeId },
      select: { id: true },
    });
    if (!emp) {
      throw new NotFoundError("Employee record not found.");
    }

    throw new PolicyBlockedError(
      "OD-013",
      "Employee document upload is unavailable until a production file storage provider is approved and configured."
    );
  }

  /**
   * Records employee offboarding and sets status to EXITED. The current employment period is
   * closed (endDate = last working date, endReason EXITED) and the exit record is linked to it
   * (one exit per period, so a person who re-joins can exit again later).
   * Clearance is not set automatically (OD-015): the exit record starts PENDING. Scheduled
   * progress reviews of the period are cancelled and a conversion offer that has not taken
   * effect is withdrawn, so nothing is applied to an exited record.
   * Gated: HR / Admin with canEmployees.
   */
  async processEmployeeExit(
    user: AuthenticatedUser,
    input: ProcessExitInput
  ): Promise<void> {
    await this.assertAdminAccess(user);

    const lastWorkingDate = new Date(input.lastWorkingDate);
    if (Number.isNaN(lastWorkingDate.getTime())) {
      throw new ValidationError("A valid last working date is required.");
    }

    try {
      await prisma.$transaction(async (tx) => {
        const emp = await tx.employee.findUnique({
          where: { id: input.employeeId },
          select: {
            id: true,
            userId: true,
            status: true,
            employmentType: true,
            designation: true,
            department: true,
            joiningDate: true,
            applicationId: true,
            employmentPeriods: {
              where: { endDate: null },
              orderBy: { startDate: "desc" },
              take: 1,
              select: { id: true, startDate: true, exitRecord: { select: { id: true } } },
            },
          },
        });

        if (!emp) {
          throw new NotFoundError("Employee record not found.");
        }
        assertNotOwnEmployeeRecord(user, emp.userId);

        if (emp.status === EmployeeStatus.EXITED) {
          throw new ValidationError("This employee has already exited.");
        }

        const currentPeriod = emp.employmentPeriods[0] ?? null;
        if (currentPeriod?.exitRecord) {
          throw new ValidationError("An exit has already been recorded for the current employment period.");
        }
        const periodStart = currentPeriod?.startDate ?? emp.joiningDate;
        if (periodStart && calendarDayKey(lastWorkingDate) < calendarDayKey(periodStart)) {
          throw new ValidationError(
            `The last working date cannot be before the current employment period started (${calendarDayKey(periodStart)}).`
          );
        }

        const updated = await tx.employee.updateMany({
          where: { id: emp.id, status: emp.status },
          data: { status: EmployeeStatus.EXITED },
        });
        if (updated.count !== 1) {
          throw new ConflictError("The employee status was changed by another action. Reload and try again.");
        }

        // Close the current period, or record one for legacy data that never had a period.
        let periodId: string;
        if (currentPeriod) {
          const closed = await tx.employmentPeriod.updateMany({
            where: { id: currentPeriod.id, endDate: null },
            data: { endDate: lastWorkingDate, endReason: EmploymentPeriodEndReason.EXITED },
          });
          if (closed.count !== 1) {
            throw new ConflictError("The employment period was changed by another action. Reload and try again.");
          }
          periodId = currentPeriod.id;
        } else {
          const recorded = await tx.employmentPeriod.create({
            data: {
              employeeId: emp.id,
              employmentType: emp.employmentType,
              designation: emp.designation,
              department: emp.department,
              startDate: emp.joiningDate,
              endDate: lastWorkingDate,
              startReason: EmploymentPeriodStartReason.JOINED,
              endReason: EmploymentPeriodEndReason.EXITED,
              applicationId: emp.applicationId,
              createdById: user.id,
            },
            select: { id: true },
          });
          periodId = recorded.id;
        }

        // The unique periodId on the exit record also guards concurrent exits.
        await tx.employeeExitRecord.create({
          data: {
            employeeId: emp.id,
            periodId,
            lastWorkingDate,
            resignationDate: input.resignationDate ? new Date(input.resignationDate) : null,
            reason: input.reason?.trim() || null,
            exitInterviewNotes: input.exitInterviewNotes?.trim() || null,
            processedById: user.id,
          },
        });

        // Nothing from the intern progress review may apply to an exited record.
        const cancelledReviews = await tx.conversionReview.updateMany({
          where: { employeeId: emp.id, status: ConversionReviewStatus.SCHEDULED },
          data: { status: ConversionReviewStatus.CANCELLED },
        });
        const openOffers = await tx.conversionReview.findMany({
          where: {
            employeeId: emp.id,
            outcome: ConversionReviewOutcome.CONVERT,
            convertedAt: null,
            offerStatus: { in: [ConversionOfferStatus.PENDING, ConversionOfferStatus.ACCEPTED] },
          },
          select: { id: true },
        });
        if (openOffers.length > 0) {
          await tx.conversionReview.updateMany({
            where: { id: { in: openOffers.map((o) => o.id) }, convertedAt: null },
            data: { offerStatus: ConversionOfferStatus.WITHDRAWN },
          });
          for (const offer of openOffers) {
            await cancelJobsByKeyPrefix(conversionEffectiveDedupeKey(offer.id), tx);
          }
        }

        await tx.employmentHistory.create({
          data: {
            employeeId: emp.id,
            changeType: "STATUS_CHANGE",
            previousValue: emp.status,
            newValue: EmployeeStatus.EXITED,
            effectiveDate: lastWorkingDate,
            remarks: `Exit recorded; clearance pending. Reason: ${input.reason?.trim() || "Not provided"}`,
            changedById: user.id,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            actorRole: user.roles[0] ?? "HR",
            action: "PROCESS_EMPLOYEE_EXIT",
            resourceType: "EMPLOYEE",
            resourceId: emp.id,
            diffPayload: {
              fromStatus: emp.status,
              lastWorkingDate: input.lastWorkingDate,
              reason: input.reason ?? null,
              periodId,
              cancelledReviews: cancelledReviews.count,
              withdrawnConversionOffers: openOffers.map((o) => o.id),
            },
          },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("An exit was recorded for this employment period at the same time. Reload to see it.");
      }
      throw error;
    }
  }
}

export const employeeService = new EmployeeService();
