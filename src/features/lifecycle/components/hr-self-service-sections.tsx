import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Clock,
  CreditCard,
  IdCard,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmployeeStatus, EmploymentType, PayrollStatus } from "@/types/enums";
import {
  getOwnEmploymentProfile,
  getOwnLatestPayrollRecords,
  getOwnLeaveSummary,
  getTodayAttendance,
} from "../services/self-service-dashboard-service";
import { TodayAttendanceCard } from "./today-attendance-card";
import { EmptyHint, formatCalendarDate, linkButtonClass, ProgressBar, SectionCard } from "./self-service-ui";

/*
 * Async HR self-service sections for interns and employees. Each receives the signed-in
 * user's id from the page guard and reads only that user's own records.
 */

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  PROBATION: "Probation",
  ACTIVE: "Active",
  ON_LEAVE: "On leave",
  EXITED: "Exited",
};

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: "Full time",
  INTERN: "Intern",
};

const PAYROLL_STATUS_BADGES: Record<PayrollStatus, { label: string; variant: "outline" | "secondary" | "success" | "destructive" }> = {
  DRAFT: { label: "Draft", variant: "outline" },
  FINALIZED: { label: "Finalized", variant: "secondary" },
  PAID: { label: "Paid", variant: "success" },
  VOID: { label: "Void", variant: "destructive" },
};

export async function TodayAttendanceSection({
  userId,
  canRecord,
  unavailableReason,
}: {
  userId: string;
  canRecord: boolean;
  unavailableReason?: string;
}) {
  const today = await getTodayAttendance(userId);
  return (
    <SectionCard id="today-attendance" title="Today's attendance" icon={<Clock className="h-4 w-4" />}>
      <TodayAttendanceCard
        dateKey={today.dateKey}
        record={today.record}
        canRecord={canRecord}
        unavailableReason={unavailableReason}
      />
    </SectionCard>
  );
}

export interface QuickLink {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export function QuickLinksSection({ links, title = "Quick links" }: { links: QuickLink[]; title?: string }) {
  return (
    <SectionCard id="quick-links" title={title}>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className="group flex items-center gap-3 rounded-xl border border-border/60 p-3 transition-colors hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground group-hover:text-primary">{link.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{link.description}</span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

export async function EmploymentSummarySection({ userId }: { userId: string }) {
  const profile = await getOwnEmploymentProfile(userId);

  if (!profile) {
    return (
      <SectionCard id="employment-summary" title="Employment summary" icon={<IdCard className="h-4 w-4" />}>
        <EmptyHint
          title="No employment record is linked to your account"
          description="HR creates your employment record when you join. Contact HR if you believe this is a mistake."
        />
      </SectionCard>
    );
  }

  const rows: Array<[string, React.ReactNode]> = [
    ["Employee code", <span key="code" className="font-mono">{profile.employeeCode}</span>],
    ["Designation", profile.designation],
    ["Department", profile.department],
    ["Joining date", formatCalendarDate(profile.joiningDate)],
    ["Employment type", profile.employmentType ? EMPLOYMENT_TYPE_LABELS[profile.employmentType] : "Not recorded"],
    ["Reporting manager", profile.reportingManagerName ?? "Not assigned"],
  ];

  return (
    <SectionCard
      id="employment-summary"
      title="Employment summary"
      icon={<IdCard className="h-4 w-4" />}
      action={
        <Badge variant={profile.status === EmployeeStatus.ACTIVE ? "success" : "outline"}>
          {EMPLOYEE_STATUS_LABELS[profile.status]}
        </Badge>
      }
    >
      <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border/60 bg-muted/30 p-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 font-semibold text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}

export async function LeaveSummarySection({ userId }: { userId: string }) {
  const summary = await getOwnLeaveSummary(userId);
  return (
    <SectionCard
      id="leave-summary"
      title="Leave requests"
      icon={<CalendarDays className="h-4 w-4" />}
      action={
        <Link href="/hrms/leave" className={linkButtonClass("ghost")}>
          Request leave <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      }
    >
      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <dt className="text-muted-foreground">Pending</dt>
          <dd className="mt-0.5 text-lg font-bold text-foreground">{summary.pending}</dd>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <dt className="text-muted-foreground">Approved</dt>
          <dd className="mt-0.5 text-lg font-bold text-foreground">{summary.approved}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Leave balances are not shown because leave entitlements have not been configured yet.
      </p>
    </SectionCard>
  );
}

export async function PayrollSummarySection({ userId }: { userId: string }) {
  const records = await getOwnLatestPayrollRecords(userId);
  return (
    <SectionCard
      id="payroll-summary"
      title="Latest payslips"
      icon={<CreditCard className="h-4 w-4" />}
      action={
        <Link href="/hrms/payroll" className={linkButtonClass("ghost")}>
          All payslips <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      }
    >
      {records.length === 0 ? (
        <EmptyHint
          icon={<CreditCard className="h-6 w-6" />}
          title="No payroll records yet"
          description="Payroll records appear here once HR adds you to a payroll period."
        />
      ) : (
        <ul className="divide-y divide-border/60">
          {records.map((record) => {
            const badge = PAYROLL_STATUS_BADGES[record.status];
            return (
              <li key={record.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold text-foreground">{record.periodCode}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatCalendarDate(record.periodStartDate)} – {formatCalendarDate(record.periodEndDate)}
                  </p>
                </div>
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

export async function OnboardingProgressSection({ userId }: { userId: string }) {
  const profile = await getOwnEmploymentProfile(userId);
  const items = profile?.onboarding ?? [];
  const completed = items.filter((item) => item.completed).length;

  return (
    <SectionCard
      id="onboarding-progress"
      title="Onboarding checklist"
      icon={<ClipboardCheck className="h-4 w-4" />}
      description="Read only. HR updates these items as they are completed."
    >
      {items.length === 0 ? (
        <EmptyHint
          icon={<ClipboardCheck className="h-6 w-6" />}
          title="No onboarding checklist recorded"
          description="Your onboarding checklist will appear here once HR records it."
        />
      ) : (
        <>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Completed</span>
              <span className="font-semibold text-foreground">
                {completed} of {items.length}
              </span>
            </div>
            <ProgressBar value={completed} max={items.length} label="Onboarding items completed" />
          </div>
          <ul className="mt-4 space-y-2">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-2 text-xs">
                {item.completed ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
                ) : (
                  <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <span className={item.completed ? "text-foreground" : "text-muted-foreground"}>
                  {item.label}
                  <span className="sr-only">{item.completed ? " (completed)" : " (not completed)"}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}
