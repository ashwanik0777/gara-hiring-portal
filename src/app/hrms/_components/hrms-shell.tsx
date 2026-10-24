import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { HRMS_NAV_ITEMS, INTERN_NAV_ITEMS } from "@/config/dashboard-nav";
import { Role } from "@/types/enums";

/**
 * Resolves the session and renders the portal shell. Rendered inside the layout's
 * Suspense boundary so the shell skeleton paints immediately.
 */
export async function HrmsShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/hrms/attendance");
  }

  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  // The layout only decides who sees the HRMS shell. It is not a security boundary:
  // every HRMS page authorizes itself and scopes data (team view requires the module
  // permission; interns and employees only see their own records).
  const HRMS_ROLES: Role[] = [Role.ADMIN, Role.HR, Role.MANAGER, Role.INTERN, Role.EMPLOYEE];
  const hasHrmsRole = user.roles.some((r) => HRMS_ROLES.includes(r));
  // Evaluation outcomes no longer grant the INTERN role (POL-07), so, as in the intern layout,
  // owning an internship enrollment also admits the user to the self-service views. No role is
  // granted; the pages scope such users to their own records.
  const ownsEnrollment = hasHrmsRole
    ? false
    : (await prisma.internshipEnrollment.count({ where: { userId: user.id } })) > 0;
  if (!hasHrmsRole && !ownsEnrollment) {
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
      navItems={hasHrmsRole ? HRMS_NAV_ITEMS : INTERN_NAV_ITEMS}
    >
      {children}
    </DashboardShell>
  );
}
