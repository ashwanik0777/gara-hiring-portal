import React, { Suspense } from "react";
import Link from "next/link";
import { Calendar, FileText, Hash, Mail, Phone, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { formatBatchDay } from "@/features/training/components/batch-dates";
import { EmployeeStatus, type EmployeeDetailCore } from "../types";
import { EmployeeOnboardingChecklist } from "./employee-onboarding-checklist";
import { EmploymentTypeBadge } from "./employment-type-badge";
import { EMPLOYEE_STATUS_META, employeeInitials } from "./employee-directory-table";
import { EmployeeSectionCard, InfoTile } from "./employee-section-card";
import {
  EmployeeAdministrationSection,
  EmployeeDocumentsSection,
  EmployeeExitSection,
  EmployeeHistoryLogSection,
  EmployeePeriodsSection,
  SectionSkeleton,
} from "./employee-detail-sections";

interface EmployeeDetailViewProps {
  /** Core record (one query); histories and documents stream in below. */
  employee: EmployeeDetailCore;
  /** Viewer; the streamed sections re-check access through the service. */
  user: AuthenticatedUser;
  /** HR/Admin with `canEmployees`: confidential notes and lifecycle controls are shown. */
  isStaffAdmin: boolean;
  isSelf: boolean;
  /** Portal route that opens the originating application, or null to hide the link. */
  applicationHrefBase: string | null;
  /** `?tab=exit` opens the Offboarding tab (linked from the intern review guidance). */
  openExitTab?: boolean;
}

function PersonLine({ name, detail }: { name: string; detail: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {employeeInitials(name)}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground wrap-break-word">{name}</p>
        <p className="text-xs text-muted-foreground wrap-break-word">{detail}</p>
      </div>
    </div>
  );
}

/**
 * Employee record shared by the admin and sub-admin portals. Authorization happens in the
 * calling page and in the employee service; this view renders the core projection it receives
 * and streams the heavier sections (administration, documents, periods, history).
 */
export function EmployeeDetailView({
  employee,
  user,
  isStaffAdmin,
  isSelf,
  applicationHrefBase,
  openExitTab = false,
}: EmployeeDetailViewProps) {
  const isExited = employee.status === EmployeeStatus.EXITED;
  const status = EMPLOYEE_STATUS_META[employee.status];
  const showConfidential = isStaffAdmin || isSelf;

  return (
    <div className="w-full space-y-6">
      <section aria-label="Employee" className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span
              aria-hidden="true"
              className={cn(
                "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold",
                isExited ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
              )}
            >
              {employeeInitials(employee.name)}
            </span>
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-foreground wrap-break-word">{employee.name}</h1>
                <Badge variant={status.variant} className="text-[10px]">
                  {status.label}
                </Badge>
                <EmploymentTypeBadge employmentType={employee.employmentType} />
              </div>
              <p className="text-sm text-foreground/80">
                {employee.designation} <span className="text-muted-foreground">· {employee.department}</span>
              </p>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <li className="inline-flex min-w-0 items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="break-all">{employee.email}</span>
                </li>
                <li className="inline-flex items-center gap-1.5 font-mono">
                  <Hash className="h-3.5 w-3.5" aria-hidden="true" />
                  {employee.employeeCode}
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                  Joined {formatBatchDay(new Date(employee.joiningDate))}
                </li>
              </ul>
            </div>
          </div>
          {employee.application && applicationHrefBase && (
            <Link
              href={`${applicationHrefBase}/${employee.application.id}`}
              className="inline-flex h-9 w-fit shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              Application {employee.application.referenceCode}
            </Link>
          )}
        </div>
      </section>

      {isStaffAdmin && (
        <Suspense fallback={<SectionSkeleton label="Loading employee administration" rows={3} />}>
          <EmployeeAdministrationSection user={user} employee={employee} openExitTab={openExitTab} />
        </Suspense>
      )}

      {isExited && (
        <Suspense fallback={<SectionSkeleton label="Loading exit record" rows={2} />}>
          <EmployeeExitSection user={user} employeeId={employee.id} isStaffAdmin={isStaffAdmin} />
        </Suspense>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <EmployeeSectionCard title="Reporting Line" icon={Users}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <InfoTile label="Manager">
              {employee.manager ? (
                <PersonLine name={employee.manager.name} detail={`${employee.manager.designation} · ${employee.manager.employeeCode}`} />
              ) : (
                <p className="text-muted-foreground">No manager</p>
              )}
            </InfoTile>
            <InfoTile label={`Direct reports (${employee.directReportCount})`}>
              {employee.directReports.length === 0 ? (
                <p className="text-muted-foreground">No direct reports</p>
              ) : (
                <ul className="space-y-3">
                  {employee.directReports.map((report) => (
                    <li key={report.id}>
                      <PersonLine name={report.name} detail={report.designation} />
                    </li>
                  ))}
                  {employee.directReportCount > employee.directReports.length && (
                    <li className="text-xs text-muted-foreground">+{employee.directReportCount - employee.directReports.length} more in the directory</li>
                  )}
                </ul>
              )}
            </InfoTile>
          </div>
        </EmployeeSectionCard>

        {showConfidential && (
          <EmployeeSectionCard
            title="Confidential Information"
            icon={ShieldCheck}
            action={
              <Badge variant="outline" className="text-[10px]">
                Restricted
              </Badge>
            }
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <InfoTile label="Personal phone">
                  <p className="inline-flex items-center gap-1.5 font-medium">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    {employee.personalPhone || <span className="font-normal text-muted-foreground">Not provided</span>}
                  </p>
                </InfoTile>
                <InfoTile label="Emergency contact">
                  {employee.emergencyContact ? (
                    <>
                      <p className="font-medium">
                        {employee.emergencyContact.name} <span className="font-normal text-muted-foreground">({employee.emergencyContact.relation})</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{employee.emergencyContact.phone}</p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">Not provided</p>
                  )}
                </InfoTile>
              </div>
              {isStaffAdmin && employee.internalNotes && (
                <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-warning">
                    <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> HR notes
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{employee.internalNotes}</p>
                </div>
              )}
            </div>
          </EmployeeSectionCard>
        )}

        {employee.onboardingChecklist && (
          <EmployeeOnboardingChecklist employeeId={employee.id} checklist={employee.onboardingChecklist} canEdit={isStaffAdmin} />
        )}

        <Suspense fallback={<SectionSkeleton label="Loading documents" rows={3} />}>
          <EmployeeDocumentsSection user={user} employeeId={employee.id} />
        </Suspense>

        <Suspense fallback={<SectionSkeleton label="Loading employment periods" rows={2} />}>
          <EmployeePeriodsSection user={user} employeeId={employee.id} />
        </Suspense>
      </div>

      <Suspense fallback={<SectionSkeleton label="Loading employment history" rows={4} />}>
        <EmployeeHistoryLogSection user={user} employeeId={employee.id} />
      </Suspense>
    </div>
  );
}
