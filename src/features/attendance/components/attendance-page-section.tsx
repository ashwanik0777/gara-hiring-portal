import React from "react";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import {
  loadAttendancePageData,
  parseAttendanceListQuery,
  type RawSearchParams,
} from "../services/attendance-page-data";
import { AttendanceManagementClient } from "./attendance-management-client";

/**
 * Streams the data-dependent part of an attendance page: reads the URL filters (month,
 * status, search, page) and loads one page server-side. The page itself only performs the
 * authentication and role guards and wraps this in `<Suspense>`.
 */
export async function AttendancePageSection({
  user,
  searchParams,
  allowSelfView,
  portalRole,
}: {
  user: AuthenticatedUser;
  searchParams: Promise<RawSearchParams>;
  allowSelfView: boolean;
  portalRole: "ADMIN" | "SUBADMIN" | "HRMS";
}) {
  const query = parseAttendanceListQuery(await searchParams);
  const pageData = await loadAttendancePageData(user, { allowSelfView, query });

  if (pageData.view === "forbidden") {
    return <UnauthorizedState message={pageData.message} />;
  }

  return <AttendanceManagementClient pageData={pageData} portalRole={portalRole} />;
}
