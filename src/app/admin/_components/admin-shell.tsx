import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { scheduleAutomationTick } from "@/features/automation/heartbeat";
import { Role } from "@prisma/client";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ADMIN_NAV_ITEMS } from "@/config/dashboard-nav";

import { SUB_ADMIN_ROLES } from "@/lib/auth/permissions";

/**
 * Resolves the session and renders the portal shell. Rendered inside the layout's
 * Suspense boundary so the shell skeleton paints immediately.
 */
export async function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/admin");
  }

  if (user.mustChangePassword) {
    redirect("/set-password");
  }
  scheduleAutomationTick();

  const isAdmin = user.roles.includes(Role.ADMIN);
  if (!isAdmin) {
    const isSubAdmin = user.roles.some((r) => SUB_ADMIN_ROLES.includes(r));
    if (isSubAdmin) {
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
