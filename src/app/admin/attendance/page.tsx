import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Role } from "@/types/enums";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { loadAttendancePageData } from "@/features/attendance/services/attendance-page-data";
import { AttendanceManagementClient } from "@/features/attendance/components/attendance-management-client";

export const instant = false;

export const metadata = {
  title: "Attendance Management — Admin Console",
  description: "Track employee check-ins, check-outs and attendance entries.",
};

export default async function AdminAttendancePage() {
  const user = await getCurrentUser();
  if (!user || !user.roles.includes(Role.ADMIN)) {
    redirect("/admin");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  const pageData = await loadAttendancePageData(user, { allowSelfView: false });
  if (pageData.view === "forbidden") {
    return <UnauthorizedState message={pageData.message} />;
  }

  return (
    <div className="w-full space-y-6">
      <AttendanceManagementClient pageData={pageData} portalRole="ADMIN" />
    </div>
  );
}
