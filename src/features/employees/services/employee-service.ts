import { prisma } from "@/lib/db";
import {
  containsPayoutProfileMarker,
  stripPayoutProfile,
} from "@/features/payroll/payout-notes";
import { assertPermission, hasPermission, type AuthenticatedUser } from "@/lib/auth/guards";
import {
  Role,
  ApplicationStatus,
  EmployeeStatus,
  EmploymentType,
  EvaluationStatus,
  OfferStatus,
  OpeningType,
  Prisma,
} from "@prisma/client";
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
  EmployeeDirectoryFilters,
  EmergencyContact,
  OnboardingChecklistItem,
  ReportingManagerOption,
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

const EMPLOYEE_ADMIN_ROLES: Role[] = [Role.ADMIN, Role.HR];

const DEFAULT_ONBOARDING_CHECKLIST: OnboardingChecklistItem[] = [
  { id: "ID_VERIFICATION", label: "Government ID and documentation verification", completed: false },
  { id: "WORKSTATION_SETUP", label: "Workstation and account access provisioning", completed: false },
  { id: "POLICY_ACKNOWLEDGMENT", label: "GARA Code of Conduct and Security Policy acknowledgment", completed: false },
  { id: "EMERGENCY_CONTACT", label: "Emergency contact verification", completed: false },
];

/**
 * Status changes allowed through the generic status update. EXITED is excluded on purpose:
 * it is reachable only through the exit flow, which creates the exit record, and it is terminal.
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

/**
 * One employment record per user (`Employee.userId` is unique). An active record blocks a
 * second joining; an exited record cannot be reused because re-joining is not defined yet.
 */
function assertNoEmployeeRecord(
  personName: string,
  profile: { employeeCode: string; status: EmployeeStatus } | null
): void {
  if (!profile) return;
  if (profile.status === EmployeeStatus.EXITED) {
    throw new ConflictError(
      `${personName} has an exited employment record (${profile.employeeCode}). Re-joining with a new record is not supported yet.`
    );
  }
  throw new ConflictError(
    `${personName} already has an active employee record (${profile.employeeCode}).`
  );
}

/**
 * Grants the portal role that comes with joining. `assignedAt` is always refreshed, even when
 * a stale row exists, because it drives the portal upgrade banner.
 */
async function grantJoiningRole(
  tx: Prisma.TransactionClient,
  userId: string,
  role: typeof Role.INTERN | typeof Role.EMPLOYEE,
  actorId: string,
  now: Date
): Promise<void> {
  await tx.userRole.upsert({
    where: { userId_role: { userId, role } },
    create: { userId, role, assignedBy: actorId, assignedAt: now },
    update: { assignedBy: actorId, assignedAt: now },
  });
}

/** Re-throws unique-constraint races (employee code, user, application) as a conflict. */
function rethrowJoiningConflict(error: unknown): never {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  ) {
    throw new ConflictError(
      "An employee record with this code, person or application was created at the same time. Reload and try again."
    );
  }
  throw error;
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
   * Full-time "Mark as joined": creates the employee record from an accepted offer.
   * STRICT GATING:
   * 1. Requires ADMIN or HR role and the canEmployees permission.
   * 2. Requires an ACCEPTED job offer and application status OFFER_ACCEPTED.
   * 3. The candidate must not already have an employee record.
   * 4. The actor must not be the candidate (separation of duties).
   * 5. The joining date must not be in the future (the person has joined).
   * Grants the EMPLOYEE role with a fresh `assignedAt` and queues the EMPLOYEE_JOINED email.
   */
  async createEmployeeFromApplication(
    user: AuthenticatedUser,
    input: CreateEmployeeFromApplicationInput
  ): Promise<ConfidentialEmployeeDetail> {
    await this.assertAdminAccess(user);
    const joiningDate = parseJoiningDate(input.joiningDate);
    assertJoiningInitialStatus(input.initialStatus);
    const employeeCode = input.employeeCode.trim();

    let createdEmployee: { id: string };
    try {
      createdEmployee = await prisma.$transaction(async (tx) => {
        const application = await tx.application.findUnique({
          where: { id: input.applicationId },
          include: {
            candidate: {
              include: {
                user: {
                  include: {
                    employeeProfile: true,
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

        // STRICT CHECK 3: User must not already have an employee record
        assertNoEmployeeRecord(candidateUser.name, candidateUser.employeeProfile);

        // STRICT CHECK 4: Employee code uniqueness (the unique constraint also guards races)
        const existingCode = await tx.employee.findUnique({
          where: { employeeCode },
          select: { id: true },
        });
        if (existingCode) {
          throw new ValidationError(
            `Employee code '${employeeCode}' is already assigned to another employee.`
          );
        }

        // STRICT CHECK 5: Manager existence if supplied
        if (input.managerId) {
          await this.assertValidManager(tx, input.managerId);
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

        // 1. Create Employee record
        const employee = await tx.employee.create({
          data: {
            userId: candidateUser.id,
            employeeCode,
            department: input.department.trim(),
            designation: input.designation.trim(),
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

        // 2. Initial employment history entry
        await tx.employmentHistory.create({
          data: {
            employeeId: employee.id,
            changeType: "HIRED",
            previousValue: null,
            newValue: employee.status,
            remarks: `Marked as joined (full-time) via application ${application.referenceCode} for ${employee.designation} (${employee.department})`,
            changedById: user.id,
          },
        });

        // 3. Application stage history (status already moved to HIRED above)
        await tx.applicationStatusHistory.create({
          data: {
            applicationId: application.id,
            fromStatus: ApplicationStatus.OFFER_ACCEPTED,
            toStatus: ApplicationStatus.HIRED,
            actorId: user.id,
            internalNotes: `Marked as joined. Employee record created with code ${employee.employeeCode}. Onboarding initiated.`,
            candidateMessage: `Welcome to GARA Innovation! You have joined as an employee (${employee.employeeCode}). Your employee home, attendance, leave and payslips are now available in your portal.`,
          },
        });

        // 4. Grant the EMPLOYEE role (fresh assignedAt drives the portal upgrade banner)
        await grantJoiningRole(tx, candidateUser.id, Role.EMPLOYEE, user.id, now);

        // 5. Welcome notification in outbox
        await tx.notificationOutbox.create({
          data: {
            recipientEmail: candidateUser.email,
            templateName: "EMPLOYEE_JOINED",
            payload: {
              employeeName: candidateUser.name,
              employeeCode: employee.employeeCode,
              department: employee.department,
              designation: employee.designation,
              joiningDate: employee.joiningDate.toISOString(),
            },
            status: "PENDING",
          },
        });

        // 6. Audit Log
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            actorRole: user.roles[0] ?? "HR",
            action: "MARK_EMPLOYEE_JOINED",
            resourceType: "EMPLOYEE",
            resourceId: employee.id,
            diffPayload: {
              applicationId: application.id,
              jobOfferId: application.jobOffer.id,
              employeeCode: employee.employeeCode,
              userId: candidateUser.id,
              joiningDate: employee.joiningDate.toISOString(),
              initialStatus: employee.status,
              employmentType: EmploymentType.FULL_TIME,
              applicationFromStatus: ApplicationStatus.OFFER_ACCEPTED,
              applicationToStatus: ApplicationStatus.HIRED,
              roleGranted: Role.EMPLOYEE,
            },
          },
        });

        return employee;
      });
    } catch (error) {
      rethrowJoiningConflict(error);
    }

    return this.getEmployeeDetail(user, createdEmployee.id);
  }

  /**
   * Intern "Mark as joined" (internship step 2): after the supervised evaluation was recorded as
   * PASSED, HR records that the person has joined. In one transaction with conditional writes it
   * creates the INTERN employee record, moves the application EVALUATION_SELECTED → HIRED, writes
   * stage, employment and audit history, grants the INTERN role with a fresh `assignedAt` and
   * queues the INTERN_JOINED welcome email.
   * Gated: ADMIN, or HR with canEmployees; never for one's own enrollment.
   */
  async createEmployeeFromInternship(
    user: AuthenticatedUser,
    input: MarkInternJoinedInput
  ): Promise<InternJoiningResult> {
    await this.assertAdminAccess(user);
    const joiningDate = parseJoiningDate(input.joiningDate);
    assertJoiningInitialStatus(input.initialStatus);
    const employeeCode = input.employeeCode.trim();

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
                employeeProfile: { select: { employeeCode: true, status: true } },
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

        assertNoEmployeeRecord(enrollment.user.name, enrollment.user.employeeProfile);

        const existingCode = await tx.employee.findUnique({
          where: { employeeCode },
          select: { id: true },
        });
        if (existingCode) {
          throw new ValidationError(
            `Employee code '${employeeCode}' is already assigned to another employee.`
          );
        }

        if (input.managerId) {
          await this.assertValidManager(tx, input.managerId);
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

        const employee = await tx.employee.create({
          data: {
            userId: enrollment.userId,
            employeeCode,
            department: input.department.trim(),
            designation: input.designation.trim(),
            joiningDate,
            status: input.initialStatus,
            employmentType: EmploymentType.INTERN,
            managerId: input.managerId || null,
            applicationId: application.id,
            onboardingChecklist: DEFAULT_ONBOARDING_CHECKLIST as unknown as Prisma.InputJsonValue,
          },
        });

        await tx.employmentHistory.create({
          data: {
            employeeId: employee.id,
            changeType: "INTERN_JOINED",
            previousValue: null,
            newValue: employee.status,
            remarks: `Marked as joined (intern) via application ${application.referenceCode} after a PASSED evaluation, as ${employee.designation} (${employee.department})`,
            changedById: user.id,
          },
        });

        await tx.applicationStatusHistory.create({
          data: {
            applicationId: application.id,
            fromStatus: ApplicationStatus.EVALUATION_SELECTED,
            toStatus: ApplicationStatus.HIRED,
            actorId: user.id,
            internalNotes: `Marked as joined as an intern. Employee record created with code ${employee.employeeCode}.`,
            candidateMessage:
              "Welcome to GARA Innovation! You have joined as an intern. Your intern workspace, attendance, leave, payslips, ID card and certificate are now available in your portal.",
          },
        });

        await grantJoiningRole(tx, enrollment.userId, Role.INTERN, user.id, now);

        await tx.notificationOutbox.create({
          data: {
            recipientEmail: enrollment.user.email,
            templateName: "INTERN_JOINED",
            payload: {
              recipientName: enrollment.user.name,
              employeeCode: employee.employeeCode,
              department: employee.department,
              designation: employee.designation,
              openingTitle: application.opening.title,
              joiningDate: employee.joiningDate.toISOString(),
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
            resourceId: employee.id,
            diffPayload: {
              enrollmentId: enrollment.id,
              applicationId: application.id,
              userId: enrollment.userId,
              employeeCode: employee.employeeCode,
              joiningDate: employee.joiningDate.toISOString(),
              initialStatus: employee.status,
              employmentType: EmploymentType.INTERN,
              managerId: employee.managerId,
              applicationFromStatus: ApplicationStatus.EVALUATION_SELECTED,
              applicationToStatus: ApplicationStatus.HIRED,
              roleGranted: Role.INTERN,
            },
          },
        });

        return { employeeId: employee.id, applicationId: application.id, enrollmentId: enrollment.id };
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
          `User ${targetUser.name} already has an employee record (${targetUser.employeeProfile.employeeCode}).`
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

  /**
   * Retrieves employee directory with strict data isolation.
   * Requires canEmployees. Never includes confidential phone, emergency contact, or private notes.
   */
  async getEmployeeDirectory(
    user: AuthenticatedUser,
    filters?: EmployeeDirectoryFilters
  ): Promise<PublicEmployeeDirectoryItem[]> {
    // ADMIN always passes; staff need the canEmployees module permission.
    await assertPermission(user, "canEmployees");

    const where: Prisma.EmployeeWhereInput = {};

    if (filters?.department) {
      where.department = filters.department;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.search) {
      const term = filters.search.trim();
      where.OR = [
        { employeeCode: { contains: term, mode: "insensitive" } },
        { designation: { contains: term, mode: "insensitive" } },
        { department: { contains: term, mode: "insensitive" } },
        { user: { name: { contains: term, mode: "insensitive" } } },
        { user: { email: { contains: term, mode: "insensitive" } } },
      ];
    }

    // Confidential fields are strictly excluded from the select query
    const employees = await prisma.employee.findMany({
      where,
      select: {
        id: true,
        employeeCode: true,
        department: true,
        designation: true,
        joiningDate: true,
        status: true,
        employmentType: true,
        user: {
          select: {
            name: true,
            email: true,
            image: true,
          },
        },
        manager: {
          select: {
            id: true,
            employeeCode: true,
            designation: true,
            user: { select: { name: true } },
          },
        },
      },
      orderBy: { employeeCode: "asc" },
    });

    return employees.map((emp) => ({
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
    }));
  }

  /**
   * Active (non-exited) employees that may be chosen as reporting manager in the joining
   * dialogs. Gated like every joining action: HR / Admin with canEmployees.
   */
  async listReportingManagerOptions(user: AuthenticatedUser): Promise<ReportingManagerOption[]> {
    await this.assertAdminAccess(user);

    const managers = await prisma.employee.findMany({
      where: { status: { not: EmployeeStatus.EXITED } },
      select: {
        id: true,
        employeeCode: true,
        designation: true,
        user: { select: { name: true } },
      },
      orderBy: { employeeCode: "asc" },
    });

    return managers.map((m) => ({
      id: m.id,
      employeeCode: m.employeeCode,
      name: m.user.name,
      designation: m.designation,
    }));
  }

  /**
   * Retrieves comprehensive employee detail with strict authorization.
   * Only ADMIN/HR with canEmployees, or the employee themselves, can access confidential data.
   */
  async getEmployeeDetail(
    user: AuthenticatedUser,
    employeeId: string
  ): Promise<ConfidentialEmployeeDetail> {
    const emp = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        manager: {
          select: {
            id: true,
            employeeCode: true,
            designation: true,
            user: { select: { name: true } },
          },
        },
        directReports: {
          select: {
            id: true,
            employeeCode: true,
            designation: true,
            department: true,
            user: { select: { name: true } },
          },
        },
        application: {
          select: {
            id: true,
            referenceCode: true,
            opening: { select: { title: true } },
          },
        },
        employmentHistories: {
          include: {
            changedBy: { select: { id: true, name: true, email: true } },
          },
          orderBy: { effectiveDate: "desc" },
        },
        secureDocuments: {
          include: {
            uploadedBy: { select: { id: true, name: true } },
          },
          orderBy: { uploadedAt: "desc" },
        },
        exitRecord: {
          include: {
            processedBy: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!emp) {
      throw new NotFoundError("Employee record not found.");
    }

    const isSelf = emp.user.id === user.id;
    const isStaffAdmin = await this.isEmployeeAdmin(user);

    if (!isStaffAdmin && !isSelf) {
      throw new ForbiddenError(
        "Access to confidential employee details requires HR, Administrator, or self authorization."
      );
    }

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
      personalPhone: emp.personalPhone,
      emergencyContact: (emp.emergencyContact as unknown as EmergencyContact) || null,
      // Internal staff notes are never visible to the employee themselves, and the payroll
      // payout block (bank account, PAN, amount) is only ever shown inside the payroll module.
      internalNotes: isStaffAdmin ? stripPayoutProfile(emp.internalNotes) : null,
      application: emp.application
        ? {
            id: emp.application.id,
            referenceCode: emp.application.referenceCode,
            openingTitle: emp.application.opening.title,
          }
        : null,
      onboardingChecklist: (emp.onboardingChecklist as unknown as OnboardingChecklistItem[]) || null,
      employmentHistories: emp.employmentHistories.map((h) => ({
        id: h.id,
        changeType: h.changeType,
        previousValue: h.previousValue,
        newValue: h.newValue,
        effectiveDate: h.effectiveDate,
        remarks: h.remarks,
        changedBy: h.changedBy,
      })),
      secureDocuments: emp.secureDocuments
        .filter((d) => isStaffAdmin || !d.isConfidential)
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
      })),
      directReports: emp.directReports.map((r) => ({
        id: r.id,
        employeeCode: r.employeeCode,
        name: r.user.name,
        designation: r.designation,
        department: r.department,
      })),
      exitRecord: emp.exitRecord
        ? {
            id: emp.exitRecord.id,
            resignationDate: emp.exitRecord.resignationDate,
            lastWorkingDate: emp.exitRecord.lastWorkingDate,
            reason: emp.exitRecord.reason,
            clearanceChecklist: emp.exitRecord.clearanceChecklist as Record<string, unknown> | null,
            exitInterviewNotes: isStaffAdmin ? emp.exitRecord.exitInterviewNotes : null,
            status: emp.exitRecord.status,
            processedBy: emp.exitRecord.processedBy,
          }
        : null,
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

          // Hierarchy cycle detection: Ensure employee is not already an ancestor of the manager
          let currentManagerId: string | null = targetManager.managerId;
          const visited = new Set<string>([targetManager.id]);

          while (currentManagerId) {
            if (currentManagerId === emp.id) {
              throw new ValidationError(
                `Circular reporting hierarchy detected: Employee ${emp.employeeCode} cannot report to ${targetManager.employeeCode} because ${targetManager.employeeCode} already reports up to ${emp.employeeCode}.`
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
   * Records employee offboarding and sets status to EXITED.
   * Clearance is not set automatically (OD-015): the exit record starts PENDING.
   * Gated: HR / Admin with canEmployees.
   */
  async processEmployeeExit(
    user: AuthenticatedUser,
    input: ProcessExitInput
  ): Promise<void> {
    await this.assertAdminAccess(user);

    await prisma.$transaction(async (tx) => {
      const emp = await tx.employee.findUnique({
        where: { id: input.employeeId },
        select: { id: true, userId: true, status: true, exitRecord: { select: { id: true } } },
      });

      if (!emp) {
        throw new NotFoundError("Employee record not found.");
      }
      assertNotOwnEmployeeRecord(user, emp.userId);

      if (emp.exitRecord) {
        throw new ValidationError("An exit record already exists for this employee.");
      }

      if (emp.status === EmployeeStatus.EXITED) {
        throw new ValidationError("This employee has already exited.");
      }

      const updated = await tx.employee.updateMany({
        where: { id: emp.id, status: emp.status },
        data: { status: EmployeeStatus.EXITED },
      });
      if (updated.count !== 1) {
        throw new ConflictError("The employee status was changed by another action. Reload and try again.");
      }

      // Unique employeeId on the exit record also guards concurrent exits.
      await tx.employeeExitRecord.create({
        data: {
          employeeId: emp.id,
          lastWorkingDate: new Date(input.lastWorkingDate),
          resignationDate: input.resignationDate ? new Date(input.resignationDate) : null,
          reason: input.reason?.trim() || null,
          exitInterviewNotes: input.exitInterviewNotes?.trim() || null,
          processedById: user.id,
        },
      });

      await tx.employmentHistory.create({
        data: {
          employeeId: emp.id,
          changeType: "STATUS_CHANGE",
          previousValue: emp.status,
          newValue: EmployeeStatus.EXITED,
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
          },
        },
      });
    });
  }
}

export const employeeService = new EmployeeService();
