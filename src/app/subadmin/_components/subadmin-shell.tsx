import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { getUserPermissions, STAFF_ROLES } from "@/lib/auth/permissions";
import { DashboardShell, DashboardNavItem } from "@/components/dashboard/dashboard-shell";

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

  // Bar Candidates from accessing Sub-Admin portal
  const hasStaffOrAdminRole = user.roles.some((r) => STAFF_ROLES.includes(r));

  if (!hasStaffOrAdminRole) {
    redirect("/candidate/dashboard");
  }

  // Fetch granular permissions
  const permissions = await getUserPermissions(user.id, user.roles);

  // Construct dynamic navigation strictly adhering to granted permissions
  const navItems: DashboardNavItem[] = [
    {
      label: "Overview",
      href: "/subadmin",
      iconName: "LayoutDashboard",
    },
  ];

  if (permissions.canApplications) {
    navItems.push({
      label: "Applications",
      href: "/subadmin/applications",
      iconName: "FileText",
    });
  }

  if (permissions.canOpenings) {
    navItems.push({
      label: "Job Openings",
      href: "/subadmin/openings",
      iconName: "Briefcase",
    });
  }

  if (permissions.canInterviews) {
    navItems.push({
      label: "Interviews",
      href: "/subadmin/interviews",
      iconName: "Calendar",
    });
  }

  if (permissions.canEvaluations) {
    navItems.push({
      label: "Evaluations",
      href: "/subadmin/evaluations",
      iconName: "Award",
    });
  }

  if (permissions.canEmployees) {
    navItems.push({
      label: "Employees",
      href: "/subadmin/employees",
      iconName: "UserCheck",
    });
  }

  if (permissions.canAttendance) {
    navItems.push({
      label: "Attendance",
      href: "/subadmin/attendance",
      iconName: "Clock",
    });
  }

  if (permissions.canLeave) {
    navItems.push({
      label: "Leave Management",
      href: "/subadmin/leave",
      iconName: "CalendarDays",
    });
  }

  if (permissions.canPayroll) {
    navItems.push({
      label: "Payroll",
      href: "/subadmin/payroll",
      iconName: "CreditCard",
    });
  }

  if (permissions.canReports) {
    navItems.push({
      label: "Analytics & Reports",
      href: "/subadmin/reports",
      iconName: "BarChart3",
    });
  }

  navItems.push({
    label: "Chatbot Support",
    href: "/subadmin/chatbot",
    iconName: "MessageSquare",
  });

  const primaryRole = user.roles.find((r) => STAFF_ROLES.includes(r)) ?? "SUB_ADMIN";

  return (
    <DashboardShell
      portalName="SUB-ADMIN PANEL"
      portalBadge={`${primaryRole} PORTAL`}
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
