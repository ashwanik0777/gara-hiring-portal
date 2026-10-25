import React from "react";
import { SelfServiceShell } from "@/features/lifecycle/components/self-service-shell";
import { HRMS_NAV_ITEMS } from "@/config/dashboard-nav";

/**
 * HRMS shell. Interns and employees get their lifecycle navigation (self-service views);
 * staff keep the HRMS team navigation. Every HRMS page authorizes itself and scopes data.
 */
export async function HrmsShell({ children }: { children: React.ReactNode }) {
  return (
    <SelfServiceShell loginCallbackPath="/hrms" staffNavItems={HRMS_NAV_ITEMS}>
      {children}
    </SelfServiceShell>
  );
}
