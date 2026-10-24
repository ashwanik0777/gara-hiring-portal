import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { loadLeavePageData } from "@/features/leave/services/leave-page-data";
import { LeaveManagementClient } from "@/features/leave/components/leave-management-client";

export const instant = false;

export const metadata = {
  title: "Leave Management — Sub-Admin Console",
  description: "Review leave applications.",
};

export default async function SubAdminLeavePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/subadmin/leave");
  if (user.mustChangePassword) redirect("/set-password");

  const hasStaffOrAdminRole = user.roles.some((r) => STAFF_ROLES.includes(r));
  if (!hasStaffOrAdminRole) redirect("/candidate/dashboard");

  // Team view requires the `canLeave` permission.
  const pageData = await loadLeavePageData(user, { allowSelfView: false });
  if (pageData.view === "forbidden") {
    return <UnauthorizedState message={pageData.message} />;
  }

  return (
    <div className="w-full">
      <LeaveManagementClient pageData={pageData} />
    </div>
  );
}
