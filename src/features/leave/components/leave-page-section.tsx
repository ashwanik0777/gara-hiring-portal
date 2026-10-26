import React from "react";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import {
  loadLeavePageData,
  parseLeaveListQuery,
  type RawSearchParams,
} from "../services/leave-page-data";
import { LeaveManagementClient } from "./leave-management-client";
import { LeaveStatsCards } from "./leave-stats-cards";

/**
 * Streams the data-dependent part of a leave page: reads the URL filters, loads one page
 * server-side and renders the summary cards on the server. The page itself only performs
 * the authentication and role guards and wraps this in `<Suspense>`.
 */
export async function LeavePageSection({
  user,
  searchParams,
  allowSelfView,
}: {
  user: AuthenticatedUser;
  searchParams: Promise<RawSearchParams>;
  allowSelfView: boolean;
}) {
  const query = parseLeaveListQuery(await searchParams);
  const pageData = await loadLeavePageData(user, { allowSelfView, query });

  if (pageData.view === "forbidden") {
    return <UnauthorizedState message={pageData.message} />;
  }

  return (
    <LeaveManagementClient
      pageData={pageData}
      initialTab={query.tab}
      statsSlot={
        <LeaveStatsCards
          stats={pageData.stats}
          activeTypeCount={pageData.leaveTypes.filter((t) => t.isActive).length}
          isTeamView={pageData.view === "team"}
        />
      }
    />
  );
}
