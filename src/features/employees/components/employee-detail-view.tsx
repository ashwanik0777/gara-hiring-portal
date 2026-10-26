import React, { Suspense } from "react";
import Link from "next/link";
import { Calendar, ChevronRight, Mail, Phone, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmployeeStatus, type EmployeeDetailCore } from "../types";
import { EmployeeOnboardingChecklist } from "./employee-onboarding-checklist";
import { EmploymentTypeBadge } from "./employment-type-badge";
import {
  EmployeeAdministrationSection,
  EmployeeDocumentsSection,
  EmployeeExitSection,
  EmployeeHistorySection,
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

function getStatusBadge(status: EmployeeStatus) {
  switch (status) {
    case EmployeeStatus.PROBATION:
      return <Badge variant="warning">Probation</Badge>;
    case EmployeeStatus.ACTIVE:
      return <Badge variant="success">Active</Badge>;
    case EmployeeStatus.ON_LEAVE:
      return <Badge variant="secondary">On Leave</Badge>;
    case EmployeeStatus.EXITED:
      return <Badge variant="destructive">Exited</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

/**
 * Employee record cockpit shared by the admin and sub-admin portals. Authorization happens in
 * the calling page and in the employee service; this view renders the core projection it
 * receives and streams the heavier sections (documents, periods, history, administration).
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

  return (
    <div className="w-full space-y-6">
      {/* Originating Application breadcrumb if present */}
      {employee.application && applicationHrefBase && (
        <div className="flex items-center justify-end">
          <Link
            href={`${applicationHrefBase}/${employee.application.id}`}
            className="flex items-center gap-1 rounded-sm text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Originating Application ({employee.application.referenceCode})
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      )}

      {/* Header Banner */}
      <Card className="border-border shadow-xs">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div
              aria-hidden="true"
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-xl font-bold text-primary"
            >
              {employee.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-bold text-foreground">{employee.name}</h1>
                {getStatusBadge(employee.status)}
                <EmploymentTypeBadge employmentType={employee.employmentType} />
                <span className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                  {employee.employeeCode}
                </span>
              </div>
              <div className="mt-1 text-sm font-medium text-foreground/90">
                {employee.designation} &bull; <span className="text-muted-foreground">{employee.department}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 break-all">
                  <Mail className="h-3 w-3 shrink-0" aria-hidden="true" /> {employee.email}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" aria-hidden="true" /> Joined:{" "}
                  {new Date(employee.joiningDate).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column (2 Cols on LG) */}
        <div className="space-y-6 lg:col-span-2">
          {/* Section: Reporting Line & Hierarchy */}
          <Card className="border-border shadow-xs">
            <CardHeader className="border-b border-border/50 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" aria-hidden="true" /> Reporting Line & Hierarchy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4 text-xs">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-border/50 bg-muted/30 p-3.5">
                  <div className="mb-1 text-[11px] text-muted-foreground">Direct Manager</div>
                  {employee.manager ? (
                    <div>
                      <div className="text-sm font-semibold text-foreground">{employee.manager.name}</div>
                      <div className="text-muted-foreground">
                        {employee.manager.designation} ({employee.manager.employeeCode})
                      </div>
                    </div>
                  ) : (
                    <div className="italic text-muted-foreground">
                      No direct manager assigned (Reports to Executive / Root)
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border/50 bg-muted/30 p-3.5">
                  <div className="mb-1 text-[11px] text-muted-foreground">
                    Direct Reports ({employee.directReportCount})
                  </div>
                  {employee.directReports.length === 0 ? (
                    <div className="italic text-muted-foreground">No direct reports.</div>
                  ) : (
                    <ul className="space-y-1">
                      {employee.directReports.map((dr) => (
                        <li key={dr.id} className="flex items-center justify-between gap-2 py-0.5">
                          <span className="font-medium text-foreground">{dr.name}</span>
                          <span className="text-[11px] text-muted-foreground">{dr.designation}</span>
                        </li>
                      ))}
                      {employee.directReportCount > employee.directReports.length && (
                        <li className="text-[11px] text-muted-foreground">
                          and {employee.directReportCount - employee.directReports.length} more in the directory.
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section: Confidential Contact & Emergency Info */}
          {(isStaffAdmin || isSelf) && (
            <Card className="border-border shadow-xs">
              <CardHeader className="border-b border-border/50 pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" /> Confidential Information
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px]">
                    Restricted Data
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-4 text-xs">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-border/40 bg-muted/20 p-3.5">
                    <div className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Phone className="h-3 w-3" aria-hidden="true" /> Personal Phone
                    </div>
                    <div className="font-semibold text-foreground">{employee.personalPhone || "Not provided"}</div>
                  </div>

                  <div className="rounded-lg border border-border/40 bg-muted/20 p-3.5">
                    <div className="mb-1 text-[11px] text-muted-foreground">Emergency Contact</div>
                    {employee.emergencyContact ? (
                      <div>
                        <div className="font-semibold text-foreground">
                          {employee.emergencyContact.name} ({employee.emergencyContact.relation})
                        </div>
                        <div className="mt-0.5 text-muted-foreground">{employee.emergencyContact.phone}</div>
                      </div>
                    ) : (
                      <div className="italic text-muted-foreground">None on record</div>
                    )}
                  </div>
                </div>

                {isStaffAdmin && employee.internalNotes && (
                  <div className="rounded-md border border-border/60 bg-muted/40 p-3">
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-warning">
                      <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> Confidential HR Notes:
                    </div>
                    <div className="whitespace-pre-wrap leading-relaxed text-foreground">{employee.internalNotes}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Suspense fallback={<SectionSkeleton label="Loading documents" rows={3} />}>
            <EmployeeDocumentsSection user={user} employeeId={employee.id} />
          </Suspense>

          <Suspense
            fallback={
              <>
                <SectionSkeleton label="Loading employment periods" rows={2} />
                <SectionSkeleton label="Loading employment history" rows={4} />
              </>
            }
          >
            <EmployeeHistorySection user={user} employeeId={employee.id} />
          </Suspense>
        </div>

        {/* Right Column (Controls & Onboarding) */}
        <div className="space-y-6">
          {employee.onboardingChecklist && (
            <EmployeeOnboardingChecklist
              employeeId={employee.id}
              checklist={employee.onboardingChecklist}
              canEdit={isStaffAdmin}
            />
          )}

          {isStaffAdmin && (
            <Suspense fallback={<SectionSkeleton label="Loading employee administration" rows={4} />}>
              <EmployeeAdministrationSection user={user} employee={employee} openExitTab={openExitTab} />
            </Suspense>
          )}

          {isExited && (
            <Suspense fallback={<SectionSkeleton label="Loading exit record" rows={2} />}>
              <EmployeeExitSection user={user} employeeId={employee.id} isStaffAdmin={isStaffAdmin} />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}
