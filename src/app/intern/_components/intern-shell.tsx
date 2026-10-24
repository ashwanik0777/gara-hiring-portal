import React from "react";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { INTERN_NAV_ITEMS } from "@/config/dashboard-nav";

/**
 * Resolves the session and renders the portal shell. Rendered inside the layout's
 * Suspense boundary so the shell skeleton paints immediately.
 */
export async function InternShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/intern/dashboard");
  }

  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  // The workspace only shows the signed-in user's own enrollment. Evaluation outcomes no longer
  // grant the INTERN role automatically (POL-07), so owning an enrollment also grants access.
  const hasInternRole = user.roles.includes(Role.INTERN) || user.roles.includes(Role.ADMIN);
  const hasOwnEnrollment = hasInternRole
    ? true
    : (await prisma.internshipEnrollment.count({ where: { userId: user.id } })) > 0;
  if (!hasOwnEnrollment) {
    redirect("/candidate/dashboard");
  }

  const primaryRole = user.roles.includes(Role.INTERN) ? Role.INTERN : user.roles[0] ?? Role.INTERN;

  return (
    <DashboardShell
      portalName="INTERN"
      portalBadge="INTERN WORKSPACE"
      user={{
        name: user.name || "Intern",
        email: user.email,
        role: primaryRole,
      }}
      navItems={INTERN_NAV_ITEMS}
    >
      {children}
    </DashboardShell>
  );
}
