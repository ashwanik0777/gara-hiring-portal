import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { HRMS_NAV_ITEMS } from "@/config/dashboard-nav";

export const instant = false;

export default async function HrmsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/hrms/attendance");
  }

  const { Role } = await import("@prisma/client");
  const HRMS_ROLES: (typeof Role)[keyof typeof Role][] = [Role.ADMIN, Role.HR, Role.MANAGER, Role.INTERN];
  const hasAccess = user.roles.some((r) => HRMS_ROLES.includes(r));
  if (!hasAccess) {
    redirect("/candidate/dashboard");
  }

  const primaryRole = user.roles[0] ?? "STAFF";

  return (
    <DashboardShell
      portalName="GARA HRMS"
      portalBadge="HRMS PORTAL"
      user={{
        name: user.name || "Employee",
        email: user.email,
        role: primaryRole,
      }}
      navItems={HRMS_NAV_ITEMS}
    >
      {children}
    </DashboardShell>
  );
}
