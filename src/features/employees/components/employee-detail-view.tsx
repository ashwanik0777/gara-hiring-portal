import React from "react";
import Link from "next/link";
import { EmployeeStatus, type ConfidentialEmployeeDetail } from "../types";
import { EmployeeLifecycleCard } from "./employee-lifecycle-card";
import { EmployeeOnboardingChecklist } from "./employee-onboarding-checklist";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  FileText,
  Mail,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Users,
  AlertTriangle,
  History,
  FolderLock,
  ChevronRight,
} from "lucide-react";

interface EmployeeDetailViewProps {
  employee: ConfidentialEmployeeDetail;
  /** HR/Admin with `canEmployees`: confidential notes and lifecycle controls are shown. */
  isStaffAdmin: boolean;
  isSelf: boolean;
  /** Candidates for the reporting-manager selector (empty unless isStaffAdmin). */
  allStaff: { id: string; employeeCode: string; name: string }[];
  /** Portal route that opens the originating application, or null to hide the link. */
  applicationHrefBase: string | null;
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
 * the calling page and in `employeeService.getEmployeeDetail`; this view only renders the
 * projection it receives.
 */
export function EmployeeDetailView({
  employee,
  isStaffAdmin,
  isSelf,
  allStaff,
  applicationHrefBase,
}: EmployeeDetailViewProps) {
  return (
    <div className="w-full space-y-6">
      {/* Originating Application breadcrumb if present */}
      {employee.application && applicationHrefBase && (
        <div className="flex items-center justify-end">
          <Link
            href={`${applicationHrefBase}/${employee.application.id}`}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            Originating Application ({employee.application.referenceCode}) <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* Header Banner */}
      <Card className="border-border shadow-xs">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xl border border-primary/20 shrink-0">
                {employee.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-xl font-bold text-foreground">{employee.name}</h1>
                  {getStatusBadge(employee.status)}
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                    {employee.employeeCode}
                  </span>
                </div>
                <div className="text-sm font-medium text-foreground/90 mt-1">
                  {employee.designation} &bull; <span className="text-muted-foreground">{employee.department}</span>
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-2">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {employee.email}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Joined: {new Date(employee.joiningDate).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols on LG) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section: Reporting Line & Hierarchy */}
          <Card className="border-border shadow-xs">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Reporting Line & Hierarchy
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-lg bg-muted/30 border border-border/50">
                  <div className="text-muted-foreground text-[11px] mb-1">Direct Manager</div>
                  {employee.manager ? (
                    <div>
                      <div className="font-semibold text-foreground text-sm">
                        {employee.manager.name}
                      </div>
                      <div className="text-muted-foreground">
                        {employee.manager.designation} ({employee.manager.employeeCode})
                      </div>
                    </div>
                  ) : (
                    <div className="text-muted-foreground italic">
                      No direct manager assigned (Reports to Executive / Root)
                    </div>
                  )}
                </div>

                <div className="p-3.5 rounded-lg bg-muted/30 border border-border/50">
                  <div className="text-muted-foreground text-[11px] mb-1">
                    Direct Reports ({employee.directReports.length})
                  </div>
                  {employee.directReports.length === 0 ? (
                    <div className="text-muted-foreground italic">No direct reports.</div>
                  ) : (
                    <div className="space-y-1">
                      {employee.directReports.map((dr) => (
                        <div key={dr.id} className="flex justify-between items-center py-0.5">
                          <span className="font-medium text-foreground">{dr.name}</span>
                          <span className="text-[11px] text-muted-foreground">{dr.designation}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section: Confidential Contact & Emergency Info */}
          {(isStaffAdmin || isSelf) && (
            <Card className="border-border shadow-xs">
              <CardHeader className="pb-3 border-b border-border/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" /> Confidential Information
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px]">Restricted Data</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3.5 rounded-lg bg-muted/20 border border-border/40">
                    <div className="text-muted-foreground text-[11px] flex items-center gap-1 mb-1">
                      <Phone className="h-3 w-3" /> Personal Phone
                    </div>
                    <div className="font-semibold text-foreground">
                      {employee.personalPhone || "Not provided"}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg bg-muted/20 border border-border/40">
                    <div className="text-muted-foreground text-[11px] mb-1">Emergency Contact</div>
                    {employee.emergencyContact ? (
                      <div>
                        <div className="font-semibold text-foreground">
                          {employee.emergencyContact.name} ({employee.emergencyContact.relation})
                        </div>
                        <div className="text-muted-foreground mt-0.5">
                          {employee.emergencyContact.phone}
                        </div>
                      </div>
                    ) : (
                      <div className="text-muted-foreground italic">None on record</div>
                    )}
                  </div>
                </div>

                {isStaffAdmin && employee.internalNotes && (
                  <div className="p-3 rounded-md bg-muted/40 border border-border/60">
                    <div className="font-semibold text-warning flex items-center gap-1.5 text-[11px] mb-1">
                      <ShieldAlert className="h-3.5 w-3.5" /> Confidential HR Notes:
                    </div>
                    <div className="text-foreground leading-relaxed whitespace-pre-wrap">
                      {employee.internalNotes}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Section: Secure Document Metadata */}
          <Card className="border-border shadow-xs">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-base flex items-center gap-2">
                <FolderLock className="h-4 w-4 text-primary" /> Secure Employee Documents ({employee.secureDocuments.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 text-xs">
              {employee.secureDocuments.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground italic">
                  No documents attached to this employee record yet.
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {employee.secureDocuments.map((doc) => (
                    <div key={doc.id} className="py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <FileText className="h-4 w-4 text-primary shrink-0" />
                        <div>
                          <div className="font-medium text-foreground">{doc.title}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {doc.documentType} &bull; {(doc.fileSizeBytes / 1024).toFixed(0)} KB &bull; Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        Private Storage
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section: Employment History Timeline */}
          <Card className="border-border shadow-xs">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4 text-primary" /> Employment History & Audit Log
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="relative border-l-2 border-border ml-3 space-y-6 pl-6 py-2 text-xs">
                {employee.employmentHistories.map((h) => (
                  <div key={h.id} className="relative group space-y-1">
                    <div className="absolute -left-[31px] top-1 h-4 w-4 rounded-full border-2 border-primary bg-card" />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold uppercase tracking-wider text-foreground text-[11px]">
                        {h.changeType}
                      </span>
                      {h.previousValue && (
                        <span className="text-muted-foreground">
                          ({h.previousValue} → <span className="font-medium text-foreground">{h.newValue}</span>)
                        </span>
                      )}
                      {!h.previousValue && (
                        <span className="font-medium text-foreground">{h.newValue}</span>
                      )}
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {new Date(h.effectiveDate).toLocaleDateString()}
                      </span>
                    </div>

                    {h.remarks && (
                      <div className="text-muted-foreground mt-0.5">
                        {h.remarks}
                      </div>
                    )}

                    {h.changedBy && (
                      <div className="text-[10px] text-muted-foreground italic">
                        Recorded by: {h.changedBy.name}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column (Controls & Onboarding) */}
        <div className="space-y-6">
          {/* Onboarding Checklist */}
          {employee.onboardingChecklist && (
            <EmployeeOnboardingChecklist
              employeeId={employee.id}
              checklist={employee.onboardingChecklist}
              canEdit={isStaffAdmin}
            />
          )}

          {/* Admin Controls */}
          {isStaffAdmin && (
            <EmployeeLifecycleCard
              employeeId={employee.id}
              currentStatus={employee.status}
              currentManagerId={employee.manager?.id}
              allStaff={allStaff}
            />
          )}

          {/* Exit Record Summary if EXITED */}
          {employee.exitRecord && (
            <Card className="border-destructive/30 bg-destructive/5 shadow-xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Exit Record
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Clearance Status:</span>{" "}
                  <span className="font-medium text-foreground">{employee.exitRecord.status}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Last Working Date:</span>{" "}
                  <span className="font-medium text-foreground">
                    {new Date(employee.exitRecord.lastWorkingDate).toLocaleDateString()}
                  </span>
                </div>
                {employee.exitRecord.reason && (
                  <div>
                    <span className="text-muted-foreground">Reason:</span>{" "}
                    <span className="text-foreground">{employee.exitRecord.reason}</span>
                  </div>
                )}
                {isStaffAdmin && employee.exitRecord.exitInterviewNotes && (
                  <div className="p-2 rounded bg-muted/40 text-[11px] mt-2 border border-border/40">
                    <span className="font-semibold block mb-0.5">Exit Interview Notes:</span>
                    {employee.exitRecord.exitInterviewNotes}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
