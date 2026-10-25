import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { getHomePathForUser } from "@/lib/auth/home";
import { DashboardShell, type DashboardNavItem } from "@/components/dashboard/dashboard-shell";
import {
  buildSelfServiceNav,
  STAGE_LABELS,
  STAGE_PORTAL_BADGES,
  STAGE_UNLOCKED_FEATURES,
} from "../capabilities";
import { getLifecycleForUser, isStaffUser } from "../services/lifecycle-service";
import { PortalUpgradeBanner } from "./portal-upgrade-banner";
import { scheduleAutomationTick } from "@/features/automation/heartbeat";

interface SelfServiceShellProps {
  children: React.ReactNode;
  /** Where to return after signing in when the visitor is anonymous. */
  loginCallbackPath: string;
  /**
   * Staff normally belong in their own portals. A portal that still serves staff
   * (e.g. legacy HRMS team views) passes the navigation to show them instead.
   */
  staffNavItems?: DashboardNavItem[];
}

/**
 * One shell for every non-staff user. The lifecycle stage decides the navigation,
 * the portal badge and which features exist at all, so the dashboard grows as the
 * person moves from candidate to intern or employee.
 */
export async function SelfServiceShell({ children, loginCallbackPath, staffNavItems }: SelfServiceShellProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(loginCallbackPath)}`);
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }
  // Signed-in traffic keeps reminders and scheduled conversions flowing between scheduler runs.
  scheduleAutomationTick();

  if (isStaffUser(user)) {
    if (!staffNavItems) {
      redirect(getHomePathForUser(user));
    }
    return (
      <DashboardShell
        portalName="GARA HRMS"
        portalBadge="HRMS PORTAL"
        user={{ name: user.name || "Staff", email: user.email, role: user.roles[0] ?? "STAFF" }}
        navItems={staffNavItems}
      >
        {children}
      </DashboardShell>
    );
  }

  const lifecycle = await getLifecycleForUser(user);
  const stageLabel = STAGE_LABELS[lifecycle.stage];
  const unlocked = STAGE_UNLOCKED_FEATURES[lifecycle.stage];

  return (
    <DashboardShell
      portalName={stageLabel}
      portalBadge={STAGE_PORTAL_BADGES[lifecycle.stage]}
      user={{ name: user.name || stageLabel, email: user.email, role: stageLabel }}
      navItems={buildSelfServiceNav(lifecycle.stage)}
      selfService
    >
      {lifecycle.recentlyUpgraded && unlocked && lifecycle.upgradedAt && (
        <PortalUpgradeBanner
          stage={lifecycle.stage}
          stageLabel={stageLabel}
          upgradedAt={lifecycle.upgradedAt}
          unlocked={unlocked}
        />
      )}
      {children}
    </DashboardShell>
  );
}
