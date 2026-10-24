import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { loadAttendancePageData } from "@/features/attendance/services/attendance-page-data";
import { AttendanceManagementClient } from "@/features/attendance/components/attendance-management-client";

export const instant = false;

export const metadata = {
  title: "Daily Attendance — HRMS",
  description: "Record daily check-ins and check-outs and review attendance logs.",
};

export default async function AttendanceModulePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/hrms/attendance");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  // Team view only for staff holding `canAttendance`; everyone else sees only their own records.
  const pageData = await loadAttendancePageData(user, { allowSelfView: true });
  if (pageData.view === "forbidden") {
    return <UnauthorizedState message={pageData.message} />;
  }

  return (
    <div className="w-full space-y-6">
      <AttendanceManagementClient pageData={pageData} portalRole="HRMS" />
    </div>
  );
}
