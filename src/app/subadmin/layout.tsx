import React, { Suspense } from "react";
import { DashboardShellSkeleton } from "@/components/feedback/page-skeletons";
import { SubAdminShell } from "./_components/subadmin-shell";

export const instant = false;

export default function SubAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<DashboardShellSkeleton label="Loading sub-admin workspace" />}>
      <SubAdminShell>{children}</SubAdminShell>
    </Suspense>
  );
}
