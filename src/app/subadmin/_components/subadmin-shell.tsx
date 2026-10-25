import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { scheduleAutomationTick } from "@/features/automation/heartbeat";
import { getUserPermissions, STAFF_ROLES } from "@/lib/auth/permissions";
import { DashboardShell, DashboardNavItem } from "@/components/dashboard/dashboard-shell";
import {
  getStaffModuleAccess,
  getStaffWorkspaces,
  listAccessibleStaffModules,
  STAFF_WORKSPACE_DETAILS,
} from "@/features/staff-dashboard/workspace";

/**
 * Resolves the session and renders the portal shell. Rendered inside the layout's
 * Suspense boundary so the shell skeleton paints immediately.
 */
export async function SubAdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/subadmin");
  }

  if (user.mustChangePassword) {
    redirect("/set-password");
  }
  scheduleAutomationTick();

  // Bar Candidates from accessing Sub-Admin portal
  const hasStaffOrAdminRole = user.roles.some((r) => STAFF_ROLES.includes(r));

  if (!hasStaffOrAdminRole) {
    redirect("/candidate/dashboard");
  }

  // Fetch granular permissions
  const permissions = await getUserPermissions(user.id, user.roles);

  // Navigation lists only the modules this user can open: permission plus the module's role rule.
  const access = getStaffModuleAccess(user.roles, permissions);
  const navItems: DashboardNavItem[] = [
    {
      label: "Overview",
      href: "/subadmin",
      iconName: "LayoutDashboard",
    },
    ...listAccessibleStaffModules(access).map((module) => ({
      label: module.label,
      href: `/subadmin${module.path}`,
      iconName: module.iconName,
    })),
    {
      label: "Chatbot Support",
      href: "/subadmin/chatbot",
      iconName: "MessageSquare",
    },
  ];

  const primaryRole = user.roles.find((r) => STAFF_ROLES.includes(r)) ?? "SUB_ADMIN";
  const primaryWorkspace = getStaffWorkspaces(user.roles)[0];

  return (
    <DashboardShell
      portalName="STAFF WORKSPACE"
      portalBadge={primaryWorkspace ? STAFF_WORKSPACE_DETAILS[primaryWorkspace].title.toUpperCase() : `${primaryRole} PORTAL`}
      user={{
        name: user.name || "Sub-Admin",
        email: user.email,
        role: primaryRole,
      }}
      navItems={navItems}
    >
      {children}
    </DashboardShell>
  );
}
