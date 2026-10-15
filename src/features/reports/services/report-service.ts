import { prisma } from "@/lib/db";
import { AuthenticatedUser } from "@/lib/auth/guards";
import {
  Role,
  Prisma,
  IdCardStatus,
  OnboardingStatus,
  CertificateStatus,
} from "@prisma/client";
import {
  ExportReportInput,
  ExportReportSchema,
  ReportFilterInput,
  ReportFilterSchema,
} from "../schemas";
import {
  AppliedReportMetadata,
  ComprehensiveOperationsReport,
  EmployeeHeadcountReport,
  InternshipLifecycleReport,
  RecruitmentFunnelReport,
  ReportCsvExportResult,
} from "../types";
import { ForbiddenError, ValidationError } from "@/lib/errors";

const AUTHORIZED_REPORT_ROLES: Role[] = [Role.ADMIN, Role.HR, Role.MANAGER];

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // Prevent CSV formula injection
  const safeStr = /^[=+\-@]/.test(str) ? `'${str}` : str;
  if (/[",\n\r]/.test(safeStr)) {
    return `"${safeStr.replace(/"/g, '""')}"`;
  }
  return safeStr;
}

export class ReportService {
  private assertReportAccess(user: AuthenticatedUser): void {
    const isAuthorized = user.roles.some((r) =>
      AUTHORIZED_REPORT_ROLES.includes(r)
    );
    if (!isAuthorized) {
      throw new ForbiddenError(
        "Operational reporting and exports are restricted to authorized Administrators, HR, and Managers."
      );
    }
  }

  private buildDateWindow(
    startDateStr?: string,
    endDateStr?: string
  ): { start?: Date; end?: Date; periodLabel: string } {
    const start = startDateStr ? new Date(`${startDateStr}T00:00:00.000Z`) : undefined;
    const end = endDateStr ? new Date(`${endDateStr}T23:59:59.999Z`) : undefined;

    if (start && end && start.getTime() > end.getTime()) {
      throw new ValidationError(
        "Report startDate cannot be later than endDate."
      );
    }

    let periodLabel = "All Time";
    if (startDateStr && endDateStr) {
      periodLabel = `${startDateStr} to ${endDateStr}`;
    } else if (startDateStr) {
      periodLabel = `From ${startDateStr}`;
    } else if (endDateStr) {
      periodLabel = `Through ${endDateStr}`;
    }

    return { start, end, periodLabel };
  }

  public async getOperationsReport(
    user: AuthenticatedUser,
    rawFilters: ReportFilterInput = {}
  ): Promise<ComprehensiveOperationsReport> {
    this.assertReportAccess(user);

    const parsed = ReportFilterSchema.safeParse(rawFilters);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? "Invalid report filter parameters.",
        parsed.error.issues
      );
    }

    const startDate = parsed.data.startDate || undefined;
    const endDate = parsed.data.endDate || undefined;
    const department = parsed.data.department?.trim() || undefined;
    const openingId = parsed.data.openingId || undefined;

    const { start, end, periodLabel } = this.buildDateWindow(startDate, endDate);

    const metadata: AppliedReportMetadata = {
      generatedAt: new Date(),
      generatedByUserId: user.id,
      generatedByName: user.name,
      periodLabel,
      filters: {
        startDate: startDate ?? null,
        endDate: endDate ?? null,
        department: department ?? null,
        openingId: openingId ?? null,
      },
    };

    const createdAtFilter: Prisma.DateTimeFilter | undefined =
      start || end
        ? {
            ...(start ? { gte: start } : {}),
            ...(end ? { lte: end } : {}),
          }
        : undefined;

    // 1. Recruitment Funnel Query (Real DB Data, sanitized fields)
    const applicationWhere: Prisma.ApplicationWhereInput = {
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      ...(openingId ? { openingId } : {}),
      ...(department
        ? {
            opening: {
              department: { equals: department, mode: "insensitive" },
            },
          }
        : {}),
    };

    const applications = await prisma.application.findMany({
      where: applicationWhere,
      select: {
        id: true,
        status: true,
        isArchived: true,
        openingId: true,
        opening: {
          select: {
            id: true,
            title: true,
            department: true,
            type: true,
          },
        },
      },
    });

    const byStatus: Record<string, number> = {};
    const openingMap = new Map<
      string,
      {
        openingId: string;
        title: string;
        department: string;
        type: string;
        applicationCount: number;
      }
    >();
    let archivedApplications = 0;

    for (const app of applications) {
      byStatus[app.status] = (byStatus[app.status] ?? 0) + 1;
      if (app.isArchived) {
        archivedApplications += 1;
      }
      const existing = openingMap.get(app.openingId);
      if (existing) {
        existing.applicationCount += 1;
      } else {
        openingMap.set(app.openingId, {
          openingId: app.opening.id,
          title: app.opening.title,
          department: app.opening.department,
          type: app.opening.type,
          applicationCount: 1,
        });
      }
    }

    const recruitment: RecruitmentFunnelReport = {
      metadata,
      totalApplications: applications.length,
      archivedApplications,
      byStatus,
      byOpening: Array.from(openingMap.values()).sort(
        (a, b) => b.applicationCount - a.applicationCount
      ),
    };

    // 2. Internship Lifecycle Query
    const enrollmentWhere: Prisma.InternshipEnrollmentWhereInput = {
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      ...(openingId || department
        ? {
            application: {
              ...(openingId ? { openingId } : {}),
              ...(department
                ? {
                    opening: {
                      department: { equals: department, mode: "insensitive" },
                    },
                  }
                : {}),
            },
          }
        : {}),
    };

    const enrollments = await prisma.internshipEnrollment.findMany({
      where: enrollmentWhere,
      select: {
        id: true,
        status: true,
        onboarding: { select: { status: true } },
        idCard: { select: { status: true } },
        certificate: { select: { status: true } },
      },
    });

    const byEvaluationStatus: Record<string, number> = {};
    let onboardingCompletedCount = 0;
    let idCardsIssuedCount = 0;
    let certificatesActiveCount = 0;
    let certificatesRevokedCount = 0;

    for (const enr of enrollments) {
      byEvaluationStatus[enr.status] = (byEvaluationStatus[enr.status] ?? 0) + 1;
      if (enr.onboarding?.status === OnboardingStatus.COMPLETED) {
        onboardingCompletedCount += 1;
      }
      if (enr.idCard?.status === IdCardStatus.ISSUED) {
        idCardsIssuedCount += 1;
      }
      if (enr.certificate?.status === CertificateStatus.ACTIVE) {
        certificatesActiveCount += 1;
      }
      if (enr.certificate?.status === CertificateStatus.REVOKED) {
        certificatesRevokedCount += 1;
      }
    }

    const internship: InternshipLifecycleReport = {
      metadata,
      totalEnrollments: enrollments.length,
      byEvaluationStatus,
      onboardingCompletedCount,
      idCardsIssuedCount,
      certificatesActiveCount,
      certificatesRevokedCount,
    };

    // 3. Employee Headcount Query (Strictly excludes confidential fields)
    const employeeWhere: Prisma.EmployeeWhereInput = {
      ...(createdAtFilter ? { joiningDate: createdAtFilter } : {}),
      ...(department
        ? { department: { equals: department, mode: "insensitive" } }
        : {}),
    };

    const employees = await prisma.employee.findMany({
      where: employeeWhere,
      select: {
        id: true,
        status: true,
        department: true,
      },
    });

    const empByStatus: Record<string, number> = {};
    const deptCounts = new Map<string, number>();

    for (const emp of employees) {
      empByStatus[emp.status] = (empByStatus[emp.status] ?? 0) + 1;
      deptCounts.set(emp.department, (deptCounts.get(emp.department) ?? 0) + 1);
    }

    const employeesReport: EmployeeHeadcountReport = {
      metadata,
      totalEmployees: employees.length,
      byStatus: empByStatus,
      byDepartment: Array.from(deptCounts.entries())
        .map(([dept, count]) => ({ department: dept, count }))
        .sort((a, b) => b.count - a.count),
    };

    return {
      metadata,
      recruitment,
      internship,
      employees: employeesReport,
    };
  }

  /**
   * Generates a sanitized CSV export for the requested report type and records
   * an immutable AuditLog entry (`EXPORT_REPORT`).
   * Strictly omits private fields (personalPhone, emergencyContact, internalNotes, resumeStorageKey, etc.).
   */
  public async exportReportCsv(
    user: AuthenticatedUser,
    rawInput: ExportReportInput
  ): Promise<ReportCsvExportResult> {
    this.assertReportAccess(user);

    const parsed = ExportReportSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? "Invalid report export parameters.",
        parsed.error.issues
      );
    }

    const { reportType } = parsed.data;
    const startDate = parsed.data.startDate || undefined;
    const endDate = parsed.data.endDate || undefined;
    const department = parsed.data.department?.trim() || undefined;
    const openingId = parsed.data.openingId || undefined;

    const { start, end } = this.buildDateWindow(startDate, endDate);

    const createdAtFilter: Prisma.DateTimeFilter | undefined =
      start || end
        ? {
            ...(start ? { gte: start } : {}),
            ...(end ? { lte: end } : {}),
          }
        : undefined;

    let headers: string[] = [];
    let rows: string[][] = [];

    if (reportType === "RECRUITMENT_PIPELINE") {
      // Select ONLY non-private fields (no resumeStorageKey, no internalNotes, no phone)
      const applications = await prisma.application.findMany({
        where: {
          ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
          ...(openingId ? { openingId } : {}),
          ...(department
            ? {
                opening: {
                  department: { equals: department, mode: "insensitive" },
                },
              }
            : {}),
        },
        select: {
          referenceCode: true,
          status: true,
          isArchived: true,
          createdAt: true,
          candidate: {
            select: {
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
          opening: {
            select: {
              title: true,
              department: true,
              type: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      headers = [
        "ReferenceCode",
        "CandidateName",
        "OpeningTitle",
        "Department",
        "OpeningType",
        "ApplicationStatus",
        "IsArchived",
        "SubmittedDate",
      ];

      rows = applications.map((app) => [
        escapeCsvCell(app.referenceCode),
        escapeCsvCell(app.candidate.user.name),
        escapeCsvCell(app.opening.title),
        escapeCsvCell(app.opening.department),
        escapeCsvCell(app.opening.type),
        escapeCsvCell(app.status),
        escapeCsvCell(app.isArchived),
        escapeCsvCell(app.createdAt.toISOString().slice(0, 10)),
      ]);
    } else if (reportType === "INTERNSHIP_LIFECYCLE") {
      // Select ONLY non-private fields (no finalReviewNotes, no supervisorFeedback)
      const enrollments = await prisma.internshipEnrollment.findMany({
        where: {
          ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
          ...(openingId || department
            ? {
                application: {
                  ...(openingId ? { openingId } : {}),
                  ...(department
                    ? {
                        opening: {
                          department: { equals: department, mode: "insensitive" },
                        },
                      }
                    : {}),
                },
              }
            : {}),
        },
        select: {
          status: true,
          workingDaysTarget: true,
          createdAt: true,
          user: {
            select: {
              name: true,
            },
          },
          application: {
            select: {
              referenceCode: true,
              opening: {
                select: {
                  title: true,
                  department: true,
                },
              },
            },
          },
          onboarding: { select: { status: true } },
          idCard: { select: { status: true, cardNumber: true } },
          certificate: { select: { status: true, verificationCode: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      headers = [
        "ApplicationRef",
        "InternName",
        "ProgrammeTitle",
        "Department",
        "EvaluationStatus",
        "WorkingDaysTarget",
        "OnboardingStatus",
        "IdCardStatus",
        "IdCardNumber",
        "CertificateStatus",
        "CertificateVerificationCode",
      ];

      rows = enrollments.map((enr) => [
        escapeCsvCell(enr.application.referenceCode),
        escapeCsvCell(enr.user.name),
        escapeCsvCell(enr.application.opening.title),
        escapeCsvCell(enr.application.opening.department),
        escapeCsvCell(enr.status),
        escapeCsvCell(enr.workingDaysTarget),
        escapeCsvCell(enr.onboarding?.status ?? "NOT_STARTED"),
        escapeCsvCell(enr.idCard?.status ?? "NOT_ISSUED"),
        escapeCsvCell(enr.idCard?.cardNumber ?? ""),
        escapeCsvCell(enr.certificate?.status ?? "NOT_ISSUED"),
        escapeCsvCell(enr.certificate?.verificationCode ?? ""),
      ]);
    } else {
      // EMPLOYEE_HEADCOUNT: Strictly omit personalPhone, emergencyContact, internalNotes
      const employees = await prisma.employee.findMany({
        where: {
          ...(createdAtFilter ? { joiningDate: createdAtFilter } : {}),
          ...(department
            ? { department: { equals: department, mode: "insensitive" } }
            : {}),
        },
        select: {
          employeeCode: true,
          department: true,
          designation: true,
          status: true,
          joiningDate: true,
          user: {
            select: {
              name: true,
            },
          },
          manager: {
            select: {
              employeeCode: true,
              user: { select: { name: true } },
            },
          },
        },
        orderBy: { employeeCode: "asc" },
      });

      headers = [
        "EmployeeCode",
        "EmployeeName",
        "Department",
        "Designation",
        "Status",
        "JoiningDate",
        "ManagerName",
      ];

      rows = employees.map((emp) => [
        escapeCsvCell(emp.employeeCode),
        escapeCsvCell(emp.user.name),
        escapeCsvCell(emp.department),
        escapeCsvCell(emp.designation),
        escapeCsvCell(emp.status),
        escapeCsvCell(emp.joiningDate.toISOString().slice(0, 10)),
        escapeCsvCell(emp.manager?.user.name ?? ""),
      ]);
    }

    const csvLines = [
      headers.join(","),
      ...rows.map((r) => r.join(",")),
    ];
    const csvContent = csvLines.join("\n");
    const generatedAt = new Date();

    const appliedFilters: AppliedReportMetadata["filters"] = {
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      department: department ?? null,
      openingId: openingId ?? null,
    };

    // Track consequential export in AuditLog
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: user.roles.join(","),
        action: "EXPORT_REPORT",
        resourceType: "Report",
        resourceId: reportType,
        diffPayload: {
          reportType,
          rowCount: rows.length,
          filters: appliedFilters,
        },
      },
    });

    const dateStamp = generatedAt.toISOString().slice(0, 10);
    return {
      reportType,
      fileName: `gara-${reportType.toLowerCase().replace(/_/g, "-")}-${dateStamp}.csv`,
      csvContent,
      rowCount: rows.length,
      generatedAt,
      appliedFilters,
    };
  }
}

export const reportService = new ReportService();
