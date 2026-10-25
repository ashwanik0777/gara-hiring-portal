import React from "react";
import { Route } from "lucide-react";
import { EmploymentPeriodTimeline } from "@/features/employees/components/employment-period-timeline";
import { getOwnEmploymentPeriods } from "../services/self-service-dashboard-service";
import { SectionCard } from "./self-service-ui";

/**
 * The signed-in person's own employment periods (joining, re-joining, conversion). Shown in the
 * employee home, the intern workspace and, for people who exited, the candidate dashboard.
 * Renders nothing when no period exists yet.
 */
export async function EmploymentPeriodsSection({
  userId,
  title = "Your employment history",
  description,
}: {
  userId: string;
  title?: string;
  description?: string;
}) {
  const periods = await getOwnEmploymentPeriods(userId);
  if (periods.length === 0) {
    return null;
  }

  return (
    <SectionCard
      id="employment-periods"
      title={title}
      icon={<Route className="h-4 w-4" />}
      description={description ?? "Each time you joined, re-joined or changed to full time."}
    >
      <EmploymentPeriodTimeline periods={periods} />
    </SectionCard>
  );
}
