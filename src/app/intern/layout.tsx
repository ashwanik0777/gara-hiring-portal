import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { INTERN_NAV_ITEMS } from "@/config/dashboard-nav";

export const instant = false;

export default async function InternLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/intern/dashboard");
  }

  const primaryRole = user.roles[0] ?? "INTERN";

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
