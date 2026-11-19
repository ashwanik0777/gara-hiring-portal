import React from "react";
import { Lock, Settings2, UserCheck, Users } from "lucide-react";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import type { SubAdminStats } from "../types";

/** Staff account summary (server-rendered); every figure is counted in the database. */
export function SubAdminStatsCards({ stats }: { stats: SubAdminStats }) {
  return (
    <StatGrid columns={4} label="Sub-admin summary">
      <StatCard label="Total Sub-Admins" value={stats.total} icon={Users} tone="blue" hint="Configured delegates" />
      <StatCard label="HR Specialists" value={stats.hrCount} icon={UserCheck} tone="emerald" hint="Hiring & onboarding" />
      <StatCard
        label="Managers & Reviewers"
        value={stats.reviewerCount}
        icon={Settings2}
        tone="violet"
        hint="Evaluations & reviews"
      />
      <StatCard
        label="Multi-Module Scope"
        value={stats.multiModuleCount}
        icon={Lock}
        tone="amber"
        hint="4+ module permissions"
      />
    </StatGrid>
  );
}
