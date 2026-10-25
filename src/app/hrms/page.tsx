import React, { Suspense } from "react";
import { CalendarDays, Clock, CreditCard, HelpCircle, History, User } from "lucide-react";
import { ListCardSkeleton } from "@/components/feedback/page-skeletons";
import { requirePortalCapability } from "@/features/lifecycle/services/lifecycle-service";
import {
  EMPLOYEE_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  EmploymentSummarySection,
  LeaveSummarySection,
  OnboardingProgressSection,
  PayrollSummarySection,
  QuickLinksSection,
  TodayAttendanceSection,
  type QuickLink,
} from "@/features/lifecycle/components/hr-self-service-sections";
import { SectionSkeleton } from "@/features/lifecycle/components/self-service-ui";
import { EmploymentPeriodsSection } from "@/features/lifecycle/components/employment-periods-section";
import { EmployeeStatus } from "@/types/enums";

export const instant = false;

export const metadata = {
  title: "Home — Employee Portal",
  description: "Your employment summary, attendance, leave and payslips.",
};

const EMPLOYEE_QUICK_LINKS: QuickLink[] = [
  { href: "/hrms/attendance", label: "Attendance", description: "Check in and review your history", icon: Clock },
  { href: "/hrms/leave", label: "Leave", description: "Request leave and track requests", icon: CalendarDays },
  { href: "/hrms/payroll", label: "Payslips", description: "Your payroll records", icon: CreditCard },
  { href: "/candidate/applications", label: "My Journey", description: "Your application history", icon: History },
  { href: "/candidate/profile", label: "My Profile", description: "Contact and profile details", icon: User },
  { href: "/help", label: "Support & Help", description: "Questions about the portal", icon: HelpCircle },
];

function SectionFallback({ label, rows = 2 }: { label: string; rows?: number }) {
  return (
    <SectionSkeleton label={label}>
      <ListCardSkeleton rows={rows} />
    </SectionSkeleton>
  );
}

export default async function EmployeeHomePage() {
  // Joined employees only; staff go to their portals and other stages to their own home.
  const { user, lifecycle } = await requirePortalCapability("employeeHome", { callbackPath: "/hrms" });
  const employment = lifecycle.employment;
  const firstName = user.name?.trim().split(/\s+/)[0] || "there";
  const canRecordAttendance = Boolean(employment && employment.status !== EmployeeStatus.EXITED);

  return (
    <div className="w-full space-y-6">
      <header className="space-y-1.5">
        <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Welcome, {firstName}</h2>
        <p className="text-sm text-muted-foreground">
          {employment
            ? [
                employment.designation,
                employment.department,
                employment.employmentType ? EMPLOYMENT_TYPE_LABELS[employment.employmentType] : null,
                EMPLOYEE_STATUS_LABELS[employment.status],
              ]
                .filter(Boolean)
                .join(" · ")
            : "Your employee self-service home."}
        </p>
      </header>

      <Suspense fallback={<SectionFallback label="Loading employment summary" rows={3} />}>
        <EmploymentSummarySection userId={user.id} />
      </Suspense>

      <Suspense fallback={<SectionFallback label="Loading employment history" rows={2} />}>
        <EmploymentPeriodsSection userId={user.id} />
      </Suspense>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Suspense fallback={<SectionFallback label="Loading today's attendance" />}>
            <TodayAttendanceSection
              userId={user.id}
              canRecord={canRecordAttendance}
              unavailableReason="Self check-in is available once HR links an active employee record to your account."
            />
          </Suspense>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Suspense fallback={<SectionFallback label="Loading leave requests" />}>
              <LeaveSummarySection userId={user.id} />
            </Suspense>
            <Suspense fallback={<SectionFallback label="Loading payslips" rows={3} />}>
              <PayrollSummarySection userId={user.id} />
            </Suspense>
          </div>
          <Suspense fallback={<SectionFallback label="Loading onboarding checklist" rows={4} />}>
            <OnboardingProgressSection userId={user.id} />
          </Suspense>
        </div>
        <QuickLinksSection links={EMPLOYEE_QUICK_LINKS} />
      </div>
    </div>
  );
}
