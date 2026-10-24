import React, { Suspense } from "react";
import { DashboardShellSkeleton } from "@/components/feedback/page-skeletons";
import { AdminShell } from "./_components/admin-shell";

export const instant = false;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<DashboardShellSkeleton label="Loading admin workspace" />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
