import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { loadAttendancePageData } from "@/features/attendance/services/attendance-page-data";
import { AttendanceManagementClient } from "@/features/attendance/components/attendance-management-client";

export const instant = false;

export const metadata = {
  title: "Attendance Management — Sub-Admin Portal",
  description: "Track employee check-ins, check-outs and attendance entries.",
};

export default async function SubAdminAttendancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/subadmin/attendance");
  if (user.mustChangePassword) redirect("/set-password");

  const hasStaffOrAdminRole = user.roles.some((r) => STAFF_ROLES.includes(r));
  if (!hasStaffOrAdminRole) redirect("/candidate/dashboard");

  // Team view requires the `canAttendance` permission.
  const pageData = await loadAttendancePageData(user, { allowSelfView: false });
  if (pageData.view === "forbidden") {
    return <UnauthorizedState message={pageData.message} />;
  }

  return (
    <div className="w-full space-y-6">
      <AttendanceManagementClient pageData={pageData} portalRole="SUBADMIN" />
    </div>
  );
}
