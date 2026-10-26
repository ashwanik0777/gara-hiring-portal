import React, { cache } from "react";
import { AlertTriangle, FileText, FolderLock, History, Route } from "lucide-react";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { toActionError } from "@/lib/errors";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListCardSkeleton } from "@/components/feedback/page-skeletons";
import { employeeService } from "../services/employee-service";
import { EmployeeStatus, type EmployeeDetailCore, type EmployeeHistory } from "../types";
import { EmployeeLifecycleCard } from "./employee-lifecycle-card";
import { EmploymentPeriodTimeline, type TimelinePeriod } from "./employment-period-timeline";
import { SectionUnavailable } from "./section-unavailable";

/*
 * Streamed sections of the employee record. The page renders the core (one query) first; each
 * section below runs its own bounded query inside a <Suspense> boundary and re-checks access
 * through the service. A failed query shows an honest notice instead of an empty list.
 */

/** One history query per request even though two sections (timeline, exit card) read it. */
const loadHistory = cache((user: AuthenticatedUser, employeeId: string) =>
  employeeService.getEmployeeHistory(user, employeeId)
);

const UNAVAILABLE = "This section could not be loaded right now. Please refresh to try again.";

export function SectionSkeleton({ label, rows = 4 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <ListCardSkeleton rows={rows} />
    </div>
  );
}

function SectionCard({
  title,
  icon,
  children,
  contentClassName = "pt-4 text-xs",
}: {
  title: React.ReactNode;
  icon: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
}) {
  return (
    <Card className="border-border shadow-xs">
      <CardHeader className="border-b border-border/50 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span aria-hidden="true" className="text-primary">
            {icon}
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}

/** Periods with the matching exit reason (staff view) or date only (self view). */
function toTimelinePeriods(history: EmployeeHistory): TimelinePeriod[] {
  return history.employmentPeriods.map((period) => {
    const exit = history.exitRecords.find((x) => x.periodId === period.id);
    return { ...period, note: exit?.reason ? `Exit reason: ${exit.reason}` : null };
  });
}

interface SectionProps {
  user: AuthenticatedUser;
  employeeId: string;
}

/** Secure document metadata (bounded; confidential documents are staff-only in the service). */
export async function EmployeeDocumentsSection({ user, employeeId }: SectionProps) {
  const icon = <FolderLock className="h-4 w-4" />;
  let documents;
  try {
    documents = await employeeService.getEmployeeDocuments(user, employeeId);
  } catch (error) {
    return (
      <SectionCard title="Secure Employee Documents" icon={icon}>
        <SectionUnavailable message={toActionError(error, UNAVAILABLE)} />
      </SectionCard>
    );
  }

  return (
    <SectionCard title={`Secure Employee Documents (${documents.length})`} icon={icon}>
      {documents.length === 0 ? (
        <div className="py-6 text-center italic text-muted-foreground">
          No documents attached to this employee record yet.
        </div>
      ) : (
        <ul className="divide-y divide-border/40">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">{doc.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {doc.documentType} &bull; {(doc.fileSizeBytes / 1024).toFixed(0)} KB &bull; Uploaded{" "}
                    {new Date(doc.uploadedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                Private Storage
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/** Employment periods and the history / audit timeline. */
export async function EmployeeHistorySection({ user, employeeId }: SectionProps) {
  let history: EmployeeHistory;
  try {
    history = await loadHistory(user, employeeId);
  } catch (error) {
    const message = toActionError(error, UNAVAILABLE);
    return (
      <>
        <SectionCard title="Employment Periods" icon={<Route className="h-4 w-4" />}>
          <SectionUnavailable message={message} />
        </SectionCard>
        <SectionCard title="Employment History & Audit Log" icon={<History className="h-4 w-4" />}>
          <SectionUnavailable message={message} />
        </SectionCard>
      </>
    );
  }

  return (
    <>
      <SectionCard title="Employment Periods" icon={<Route className="h-4 w-4" />} contentClassName="pt-5">
        <EmploymentPeriodTimeline periods={toTimelinePeriods(history)} />
      </SectionCard>

      <SectionCard
        title="Employment History & Audit Log"
        icon={<History className="h-4 w-4" />}
        contentClassName="pt-6"
      >
        {history.employmentHistories.length === 0 ? (
          <p className="pb-2 text-center text-xs italic text-muted-foreground">No history recorded yet.</p>
        ) : (
          <ol className="relative ml-3 space-y-6 border-l-2 border-border py-2 pl-6 text-xs">
            {history.employmentHistories.map((h) => (
              <li key={h.id} className="relative space-y-1">
                <span
                  aria-hidden="true"
                  className="absolute -left-[31px] top-1 h-4 w-4 rounded-full border-2 border-primary bg-card"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                    {h.changeType}
                  </span>
                  {h.previousValue ? (
                    <span className="text-muted-foreground">
                      ({h.previousValue} → <span className="font-medium text-foreground">{h.newValue}</span>)
                    </span>
                  ) : (
                    <span className="font-medium text-foreground">{h.newValue}</span>
                  )}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {new Date(h.effectiveDate).toLocaleDateString()}
                  </span>
                </div>
                {h.remarks && <div className="mt-0.5 text-muted-foreground">{h.remarks}</div>}
                {h.changedBy && (
                  <div className="text-[10px] italic text-muted-foreground">Recorded by: {h.changedBy.name}</div>
                )}
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
    </>
  );
}

/** Current exit record (EXITED employees); earlier exits appear in the period timeline. */
export async function EmployeeExitSection({
  user,
  employeeId,
  isStaffAdmin,
}: SectionProps & { isStaffAdmin: boolean }) {
  let history: EmployeeHistory;
  try {
    history = await loadHistory(user, employeeId);
  } catch (error) {
    return <SectionUnavailable title="Exit Record" message={toActionError(error, UNAVAILABLE)} />;
  }

  const latestExit = history.exitRecords[0];
  if (!latestExit) {
    return null;
  }

  return (
    <Card className="border-destructive/30 bg-destructive/5 shadow-xs">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Exit Record
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div>
          <span className="text-muted-foreground">Clearance Status:</span>{" "}
          <span className="font-medium text-foreground">{latestExit.status}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Last Working Date:</span>{" "}
          <span className="font-medium text-foreground">
            {new Date(latestExit.lastWorkingDate).toLocaleDateString()}
          </span>
        </div>
        {latestExit.reason && (
          <div>
            <span className="text-muted-foreground">Reason:</span>{" "}
            <span className="text-foreground">{latestExit.reason}</span>
          </div>
        )}
        {isStaffAdmin && latestExit.exitInterviewNotes && (
          <div className="mt-2 rounded border border-border/40 bg-muted/40 p-2 text-[11px]">
            <span className="mb-0.5 block font-semibold">Exit Interview Notes:</span>
            {latestExit.exitInterviewNotes}
          </div>
        )}
        {isStaffAdmin && (
          <p className="text-[11px] text-muted-foreground">
            If this person is hired again with the same account, marking them as joined reuses this record and
            employee code and starts a new employment period.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Lifecycle controls (status, manager, offboarding) with the bounded reporting-manager choices. */
export async function EmployeeAdministrationSection({
  user,
  employee,
  openExitTab,
}: {
  user: AuthenticatedUser;
  employee: EmployeeDetailCore;
  openExitTab: boolean;
}) {
  let managers;
  try {
    managers = await employeeService.listReportingManagerOptions(user, { excludeEmployeeId: employee.id });
  } catch (error) {
    return <SectionUnavailable title="Employee administration" message={toActionError(error, UNAVAILABLE)} />;
  }

  return (
    <EmployeeLifecycleCard
      employeeId={employee.id}
      currentStatus={employee.status}
      currentManagerId={employee.manager?.id}
      // Same "Name (CODE)" label as the picker; the manager may be outside the preloaded options.
      currentManagerLabel={employee.manager ? `${employee.manager.name} (${employee.manager.employeeCode})` : null}
      allStaff={managers.map((m) => ({ id: m.id, employeeCode: m.employeeCode, name: m.name }))}
      initialTab={openExitTab && employee.status !== EmployeeStatus.EXITED ? "EXIT" : "STATUS"}
    />
  );
}
