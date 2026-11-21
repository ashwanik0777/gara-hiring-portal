import React, { cache } from "react";
import { AlertTriangle, FileText, FolderLock, History, Route } from "lucide-react";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { toActionError } from "@/lib/errors";
import { Badge } from "@/components/ui/badge";
import { ListCardSkeleton } from "@/components/feedback/page-skeletons";
import { formatBatchDay } from "@/features/training/components/batch-dates";
import { employeeService } from "../services/employee-service";
import { EmployeeStatus, type EmployeeDetailCore, type EmployeeHistory } from "../types";
import { EmployeeLifecycleCard } from "./employee-lifecycle-card";
import { EmploymentPeriodTimeline, type TimelinePeriod } from "./employment-period-timeline";
import { SectionUnavailable } from "./section-unavailable";
import { EmployeeSectionCard } from "./employee-section-card";

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

const day = (value: Date | string) => formatBatchDay(new Date(value));

/** "STATUS_CHANGE" → "Status change". */
function humanize(value: string): string {
  const text = value.replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** History values: enum codes ("ON_LEAVE") read as words; names and other text stay as recorded. */
const historyValue = (value: string) => (/^[A-Z][A-Z_]+$/.test(value) ? humanize(value) : value);

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
  let documents;
  try {
    documents = await employeeService.getEmployeeDocuments(user, employeeId);
  } catch (error) {
    return (
      <EmployeeSectionCard title="Documents" icon={FolderLock}>
        <SectionUnavailable message={toActionError(error, UNAVAILABLE)} />
      </EmployeeSectionCard>
    );
  }

  return (
    <EmployeeSectionCard title={`Documents (${documents.length})`} icon={FolderLock}>
      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents yet</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{doc.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {humanize(doc.documentType)} · {(doc.fileSizeBytes / 1024).toFixed(0)} KB · {day(doc.uploadedAt)}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                Private
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </EmployeeSectionCard>
  );
}

/** Employment periods (joining, re-joining, conversion), newest first. */
export async function EmployeePeriodsSection({ user, employeeId }: SectionProps) {
  let history: EmployeeHistory;
  try {
    history = await loadHistory(user, employeeId);
  } catch (error) {
    return (
      <EmployeeSectionCard title="Employment Periods" icon={Route}>
        <SectionUnavailable message={toActionError(error, UNAVAILABLE)} />
      </EmployeeSectionCard>
    );
  }
  return (
    <EmployeeSectionCard title="Employment Periods" icon={Route}>
      <EmploymentPeriodTimeline periods={toTimelinePeriods(history)} emptyText="No employment periods yet" />
    </EmployeeSectionCard>
  );
}

/** Every recorded change to the employee record (status, manager, exit), newest first. */
export async function EmployeeHistoryLogSection({ user, employeeId }: SectionProps) {
  let history: EmployeeHistory;
  try {
    history = await loadHistory(user, employeeId);
  } catch (error) {
    return (
      <EmployeeSectionCard title="History" icon={History}>
        <SectionUnavailable message={toActionError(error, UNAVAILABLE)} />
      </EmployeeSectionCard>
    );
  }

  return (
    <EmployeeSectionCard title="History" icon={History}>
      {history.employmentHistories.length === 0 ? (
        <p className="text-sm text-muted-foreground">No changes recorded yet</p>
      ) : (
        <ol className="relative ml-2 space-y-5 border-l-2 border-border pl-6">
          {history.employmentHistories.map((h) => (
            <li key={h.id} className="relative">
              <span aria-hidden="true" className="absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full border-2 border-primary bg-card" />
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm text-foreground">
                    <span className="font-semibold">{humanize(h.changeType)}</span>
                    {h.previousValue ? (
                      <span className="text-muted-foreground">
                        {" "}
                        {historyValue(h.previousValue)} → <span className="font-medium text-foreground">{historyValue(h.newValue)}</span>
                      </span>
                    ) : (
                      <span className="font-medium"> {historyValue(h.newValue)}</span>
                    )}
                  </p>
                  {h.remarks && <p className="text-xs text-muted-foreground">{h.remarks}</p>}
                  {h.changedBy && <p className="text-xs text-muted-foreground">By {h.changedBy.name}</p>}
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{day(h.effectiveDate)}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </EmployeeSectionCard>
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
    <section aria-label="Exit record" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-destructive">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Exit Record
      </h2>
      <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Last working day</dt>
          <dd className="mt-0.5 font-medium text-foreground">{day(latestExit.lastWorkingDate)}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Clearance</dt>
          <dd className="mt-0.5 font-medium text-foreground">{humanize(latestExit.status)}</dd>
        </div>
        {latestExit.reason && (
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Reason</dt>
            <dd className="mt-0.5 text-foreground">{latestExit.reason}</dd>
          </div>
        )}
      </dl>
      {isStaffAdmin && latestExit.exitInterviewNotes && (
        <div className="mt-3 rounded-xl border border-border/60 bg-card/60 p-3 text-sm">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Exit interview notes</p>
          <p className="mt-1 whitespace-pre-wrap text-foreground">{latestExit.exitInterviewNotes}</p>
        </div>
      )}
    </section>
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
