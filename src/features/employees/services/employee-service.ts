import { prisma } from "@/lib/db";
import { AuthenticatedUser } from "@/lib/auth/guards";
import {
  Role,
  ApplicationStatus,
  EmployeeStatus,
  Prisma,
} from "@prisma/client";
import {
  CreateEmployeeFromApplicationInput,
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
} from "../types";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

const EMPLOYEE_ADMIN_ROLES: Role[] = [Role.ADMIN, Role.HR];

const DEFAULT_ONBOARDING_CHECKLIST: OnboardingChecklistItem[] = [
  { id: "ID_VERIFICATION", label: "Government ID and documentation verification", completed: false },
  { id: "WORKSTATION_SETUP", label: "Workstation and account access provisioning", completed: false },
  { id: "POLICY_ACKNOWLEDGMENT", label: "GARA Code of Conduct and Security Policy acknowledgment", completed: false },
  { id: "EMERGENCY_CONTACT", label: "Emergency contact verification", completed: false },
];

export class EmployeeService {
  private assertAdminAccess(user: AuthenticatedUser): void {
    const isAuthorized = user.roles.some((r) => EMPLOYEE_ADMIN_ROLES.includes(r));
    if (!isAuthorized) {
      throw new ForbiddenError(
        "Employee records management is restricted to authorized HR and Administrators."
      );
    }
  }

  /**
   * Creates an employee record from a successfully accepted recruitment application.
   * STRICT GATING:
   * 1. Requires ADMIN or HR role.
   * 2. Requires Application status to be OFFER_ACCEPTED.
   * 3. Candidate must not already have an employee profile.
   */
  async createEmployeeFromApplication(
    user: AuthenticatedUser,
    input: CreateEmployeeFromApplicationInput
  ): Promise<ConfidentialEmployeeDetail> {
    this.assertAdminAccess(user);

    const application = await prisma.application.findUnique({
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
        opening: { select: { title: true } },
        jobOffer: true,
      },
    });

    if (!application) {
      throw new NotFoundError("Application record not found.");
    }

    // STRICT CHECK 1: Application status must be OFFER_ACCEPTED
    if (application.status !== ApplicationStatus.OFFER_ACCEPTED) {
      throw new ValidationError(
        `Cannot create employee record: Application status is currently '${application.status}'. A candidate can only be hired after their job offer is explicitly accepted ('OFFER_ACCEPTED').`
      );
    }

    const candidateUser = application.candidate.user;

    // STRICT CHECK 2: User must not already be an employee
    if (candidateUser.employeeProfile) {
      throw new ValidationError(
        `Candidate ${candidateUser.name} already has an active employee record (${candidateUser.employeeProfile.employeeCode}).`
      );
    }

    // STRICT CHECK 3: Employee code uniqueness
    const existingCode = await prisma.employee.findUnique({
      where: { employeeCode: input.employeeCode.trim() },
    });
    if (existingCode) {
      throw new ValidationError(
        `Employee code '${input.employeeCode}' is already assigned to another employee.`
      );
    }

    // STRICT CHECK 4: Manager existence if supplied
    if (input.managerId) {
      const manager = await prisma.employee.findUnique({
        where: { id: input.managerId },
      });
      if (!manager) {
        throw new NotFoundError("Assigned manager not found.");
      }
    }

    const createdEmployee = await prisma.$transaction(async (tx) => {
      // 1. Create Employee record
      const employee = await tx.employee.create({
        data: {
          userId: candidateUser.id,
          employeeCode: input.employeeCode.trim(),
          department: input.department.trim(),
          designation: input.designation.trim(),
          joiningDate: new Date(input.joiningDate),
          status: EmployeeStatus.PROBATION,
          managerId: input.managerId || null,
          personalPhone: input.personalPhone?.trim() || null,
          emergencyContact: input.emergencyContact
            ? (input.emergencyContact as unknown as Prisma.InputJsonValue)
            : undefined,
          internalNotes: input.internalNotes?.trim() || null,
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
          newValue: EmployeeStatus.PROBATION,
          remarks: `Hired via application ${application.referenceCode} for ${input.designation} (${input.department})`,
          changedById: user.id,
        },
      });

      // 3. Transition Application status to HIRED
      await tx.application.update({
        where: { id: application.id },
        data: {
          status: ApplicationStatus.HIRED,
        },
      });

      await tx.applicationStatusHistory.create({
        data: {
          applicationId: application.id,
          fromStatus: ApplicationStatus.OFFER_ACCEPTED,
          toStatus: ApplicationStatus.HIRED,
          actorId: user.id,
          internalNotes: `Employee record created with code ${employee.employeeCode}. Onboarding initiated.`,
          candidateMessage: `Welcome to GARA Innovation! Your employee record has been created (${employee.employeeCode}). Please check your portal for onboarding details.`,
        },
      });

      // 4. Assign EMPLOYEE role to candidate user
      await tx.userRole.upsert({
        where: {
          userId_role: {
            userId: candidateUser.id,
            role: Role.EMPLOYEE,
          },
        },
        create: {
          userId: candidateUser.id,
          role: Role.EMPLOYEE,
          assignedBy: user.id,
        },
        update: {},
      });

      // 5. Welcome notification in outbox
      await tx.notificationOutbox.create({
        data: {
          recipientEmail: candidateUser.email,
          templateName: "EMPLOYEE_ONBOARDING_WELCOME",
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
          action: "CREATE_EMPLOYEE_FROM_APPLICATION",
          resourceType: "EMPLOYEE",
          resourceId: employee.id,
          diffPayload: {
            applicationId: application.id,
            employeeCode: employee.employeeCode,
            userId: candidateUser.id,
            joiningDate: employee.joiningDate,
          },
        },
      });

      return employee;
    });

    return this.getEmployeeDetail(user, createdEmployee.id);
  }

  /**
   * Directly creates an employee record for an existing platform user.
   * Gated: ADMIN / HR only.
   */
  async createDirectEmployee(
    user: AuthenticatedUser,
    input: DirectCreateEmployeeInput
  ): Promise<ConfidentialEmployeeDetail> {
    this.assertAdminAccess(user);

    const targetUser = await prisma.user.findUnique({
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

    const existingCode = await prisma.employee.findUnique({
      where: { employeeCode: input.employeeCode.trim() },
    });
    if (existingCode) {
      throw new ValidationError(
        `Employee code '${input.employeeCode}' is already in use.`
      );
    }

    const created = await prisma.$transaction(async (tx) => {
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
          internalNotes: input.internalNotes?.trim() || null,
          onboardingChecklist: DEFAULT_ONBOARDING_CHECKLIST as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.employmentHistory.create({
        data: {
          employeeId: employee.id,
          changeType: "DIRECT_HIRE",
          previousValue: null,
          newValue: employee.status,
          remarks: `Direct employee creation for ${input.designation}`,
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
          actorRole: user.roles[0] ?? "HR",
          action: "CREATE_DIRECT_EMPLOYEE",
          resourceType: "EMPLOYEE",
          resourceId: employee.id,
          diffPayload: {
            employeeCode: employee.employeeCode,
            userId: targetUser.id,
          },
        },
      });

      return employee;
    });

    return this.getEmployeeDetail(user, created.id);
  }

  /**
   * Retrieves employee directory with strict data isolation.
   * Public staff view: Never includes confidential phone, emergency contact, or private notes.
   */
  async getEmployeeDirectory(
    user: AuthenticatedUser,
    filters?: EmployeeDirectoryFilters
  ): Promise<PublicEmployeeDirectoryItem[]> {
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
   * Retrieves comprehensive employee detail with strict authorization.
   * Only ADMIN, HR, or the employee themselves can access confidential data.
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

    const isStaffAdmin = user.roles.some((r) => EMPLOYEE_ADMIN_ROLES.includes(r));
    const isSelf = emp.user.id === user.id;

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
      // Internal staff notes are never visible to the employee themselves
      internalNotes: isStaffAdmin ? emp.internalNotes : null,
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
   * Updates employee lifecycle status (PROBATION -> ACTIVE -> ON_LEAVE -> EXITED).
   * Gated: HR / Admin only.
   */
  async updateEmployeeStatus(
    user: AuthenticatedUser,
    input: UpdateEmployeeStatusInput
  ): Promise<void> {
    this.assertAdminAccess(user);

    const emp = await prisma.employee.findUnique({
      where: { id: input.employeeId },
    });

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

    await prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: emp.id },
        data: { status: input.toStatus },
      });

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
            remarks: input.remarks,
          },
        },
      });
    });
  }

  /**
   * Assigns or changes employee reporting manager.
   * Enforces self-assignment prevention and hierarchy cycle detection.
   * Gated: HR / Admin only.
   */
  async assignManager(
    user: AuthenticatedUser,
    input: AssignManagerInput
  ): Promise<void> {
    this.assertAdminAccess(user);

    const emp = await prisma.employee.findUnique({
      where: { id: input.employeeId },
      include: { manager: { select: { employeeCode: true } } },
    });

    if (!emp) {
      throw new NotFoundError("Employee record not found.");
    }

    if (input.managerId) {
      if (input.managerId === emp.id) {
        throw new ValidationError("An employee cannot be assigned as their own reporting manager.");
      }

      const targetManager = await prisma.employee.findUnique({
        where: { id: input.managerId },
      });

      if (!targetManager) {
        throw new NotFoundError("Selected manager not found.");
      }

      if (targetManager.status === EmployeeStatus.EXITED) {
        throw new ValidationError("Cannot assign an exited employee as reporting manager.");
      }

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

        const parent = await prisma.employee.findUnique({
          where: { id: currentManagerId },
          select: { managerId: true },
        });
        currentManagerId = parent?.managerId ?? null;
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: emp.id },
        data: { managerId: input.managerId },
      });

      await tx.employmentHistory.create({
        data: {
          employeeId: emp.id,
          changeType: "MANAGER_CHANGE",
          previousValue: emp.manager?.employeeCode || "None",
          newValue: input.managerId || "None",
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
    });
  }

  /**
   * Updates employee onboarding checklist item.
   * Gated: HR, ADMIN, or self.
   */
  async updateOnboardingChecklist(
    user: AuthenticatedUser,
    input: UpdateOnboardingChecklistInput
  ): Promise<void> {
    const emp = await prisma.employee.findUnique({
      where: { id: input.employeeId },
      select: { id: true, userId: true, onboardingChecklist: true },
    });

    if (!emp) {
      throw new NotFoundError("Employee record not found.");
    }

    const isStaffAdmin = user.roles.some((r) => EMPLOYEE_ADMIN_ROLES.includes(r));
    const isSelf = emp.userId === user.id;

    if (!isStaffAdmin && !isSelf) {
      throw new ForbiddenError("Not authorized to modify onboarding checklist.");
    }

    const currentList: OnboardingChecklistItem[] =
      (emp.onboardingChecklist as unknown as OnboardingChecklistItem[]) || DEFAULT_ONBOARDING_CHECKLIST;

    const updatedList = currentList.map((item) => {
      if (item.id === input.itemId) {
        return {
          ...item,
          completed: input.completed,
          completedAt: input.completed ? new Date().toISOString() : null,
        };
      }
      return item;
    });

    await prisma.employee.update({
      where: { id: emp.id },
      data: {
        onboardingChecklist: updatedList as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Uploads secure document metadata for an employee record.
   * Gated: HR, ADMIN, or self.
   */
  async addEmployeeDocument(
    user: AuthenticatedUser,
    input: UploadEmployeeDocumentInput
  ): Promise<void> {
    const emp = await prisma.employee.findUnique({
      where: { id: input.employeeId },
      select: { id: true, userId: true },
    });

    if (!emp) {
      throw new NotFoundError("Employee record not found.");
    }

    const isStaffAdmin = user.roles.some((r) => EMPLOYEE_ADMIN_ROLES.includes(r));
    const isSelf = emp.userId === user.id;

    if (!isStaffAdmin && !isSelf) {
      throw new ForbiddenError("Not authorized to attach employee documents.");
    }

    // Validate storage key format: must be a plausible file path without traversal
    const storageKey = input.storageKey.trim();
    if (!storageKey || storageKey.includes("..") || storageKey.includes("\0") || storageKey.startsWith("/")) {
      throw new ValidationError("Invalid storage key format.");
    }

    await prisma.$transaction(async (tx) => {
      const doc = await tx.employeeDocument.create({
        data: {
          employeeId: emp.id,
          documentType: input.documentType.trim(),
          title: input.title.trim(),
          storageKey,
          mimeType: input.mimeType.trim(),
          fileSizeBytes: input.fileSizeBytes,
          isConfidential: input.isConfidential,
          uploadedById: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] ?? "STAFF",
          action: "UPLOAD_EMPLOYEE_DOCUMENT",
          resourceType: "EMPLOYEE_DOCUMENT",
          resourceId: doc.id,
          diffPayload: {
            employeeId: emp.id,
            documentType: doc.documentType,
            title: doc.title,
          },
        },
      });
    });
  }

  /**
   * Processes employee offboarding and exit record.
   * Sets status to EXITED.
   * Gated: HR / Admin only.
   */
  async processEmployeeExit(
    user: AuthenticatedUser,
    input: ProcessExitInput
  ): Promise<void> {
    this.assertAdminAccess(user);

    const emp = await prisma.employee.findUnique({
      where: { id: input.employeeId },
      include: { exitRecord: true },
    });

    if (!emp) {
      throw new NotFoundError("Employee record not found.");
    }

    if (emp.exitRecord) {
      throw new ValidationError("An exit record already exists for this employee.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.employeeExitRecord.create({
        data: {
          employeeId: emp.id,
          lastWorkingDate: new Date(input.lastWorkingDate),
          resignationDate: input.resignationDate ? new Date(input.resignationDate) : null,
          reason: input.reason?.trim() || null,
          exitInterviewNotes: input.exitInterviewNotes?.trim() || null,
          status: "CLEARED",
          processedById: user.id,
        },
      });

      await tx.employee.update({
        where: { id: emp.id },
        data: { status: EmployeeStatus.EXITED },
      });

      await tx.employmentHistory.create({
        data: {
          employeeId: emp.id,
          changeType: "STATUS_CHANGE",
          previousValue: emp.status,
          newValue: EmployeeStatus.EXITED,
          remarks: `Offboarding completed. Reason: ${input.reason || "Standard exit"}`,
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
            lastWorkingDate: input.lastWorkingDate,
            reason: input.reason,
          },
        },
      });
    });
  }
}

export const employeeService = new EmployeeService();
