import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Role } from "@prisma/client";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ADMIN_NAV_ITEMS } from "@/config/dashboard-nav";
import { SUB_ADMIN_ROLES } from "@/lib/auth/roles";

/*
 * Legacy route tree: next.config.ts redirects every /recruitment/* URL to /admin/*.
 * It mirrors the /admin authorization (Super Administrators only) in case it is ever
 * reached; sub-admins use the /subadmin workspace.
 */

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

  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  if (!user.roles.includes(Role.ADMIN)) {
    if (user.roles.some((r) => SUB_ADMIN_ROLES.includes(r))) {
      redirect("/subadmin");
    }
    redirect("/candidate/dashboard");
  }

  const primaryRole = "ADMIN";

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
