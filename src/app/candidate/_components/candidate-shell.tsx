import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Role } from "@prisma/client";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { CANDIDATE_NAV_ITEMS } from "@/config/dashboard-nav";

import { SUB_ADMIN_ROLES } from "@/lib/auth/permissions";

/**
 * Resolves the session and renders the portal shell. Rendered inside the layout's
 * Suspense boundary so the shell skeleton paints immediately.
 */
export async function CandidateShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/candidate/dashboard");
  }

  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  const isAdmin = user.roles.includes(Role.ADMIN);
  if (isAdmin) {
    redirect("/admin");
  }

  const isSubAdmin = user.roles.some((r) => SUB_ADMIN_ROLES.includes(r));
  if (isSubAdmin) {
    redirect("/subadmin");
  }

  const primaryRole = user.roles[0] ?? "CANDIDATE";

  return (
    <DashboardShell
      portalName="CANDIDATE"
      portalBadge="CANDIDATE PORTAL"
      user={{
        name: user.name || "Candidate",
        email: user.email,
        role: primaryRole,
      }}
      navItems={CANDIDATE_NAV_ITEMS}
    >
      {children}
    </DashboardShell>
  );
}
