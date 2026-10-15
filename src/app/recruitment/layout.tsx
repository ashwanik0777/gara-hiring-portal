import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Role } from "@prisma/client";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ADMIN_NAV_ITEMS } from "@/config/dashboard-nav";

const STAFF_ROLES: Role[] = [
  Role.ADMIN,
  Role.HR,
  Role.INTERVIEWER,
  Role.MANAGER,
];

export const instant = false;

export default async function RecruitmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/recruitment/applications");
  }

  const isStaff = user.roles.some((r) => STAFF_ROLES.includes(r));
  if (!isStaff) {
    redirect("/candidate/dashboard");
  }

  const primaryRole = user.roles[0] ?? "STAFF";

  return (
    <DashboardShell
      portalName="ADMIN PANEL"
      portalBadge="ADMIN PANEL"
      user={{
        name: user.name || "Administrator",
        email: user.email,
        role: primaryRole,
      }}
      navItems={ADMIN_NAV_ITEMS}
    >
      {children}
    </DashboardShell>
  );
}
