import React, { Suspense } from "react";
import { DashboardShellSkeleton } from "@/components/feedback/page-skeletons";
import { HrmsShell } from "./_components/hrms-shell";

export const instant = false;

export default function HrmsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<DashboardShellSkeleton label="Loading HRMS workspace" />}>
      <HrmsShell>{children}</HrmsShell>
    </Suspense>
  );
}
