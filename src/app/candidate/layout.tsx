import React, { Suspense } from "react";
import { DashboardShellSkeleton } from "@/components/feedback/page-skeletons";
import { CandidateShell } from "./_components/candidate-shell";

export const instant = false;

export default function CandidateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<DashboardShellSkeleton label="Loading candidate portal" />}>
      <CandidateShell>{children}</CandidateShell>
    </Suspense>
  );
}
