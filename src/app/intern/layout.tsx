import React, { Suspense } from "react";
import { DashboardShellSkeleton } from "@/components/feedback/page-skeletons";
import { InternShell } from "./_components/intern-shell";

export const instant = false;

export default function InternLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<DashboardShellSkeleton label="Loading intern workspace" />}>
      <InternShell>{children}</InternShell>
    </Suspense>
  );
}
