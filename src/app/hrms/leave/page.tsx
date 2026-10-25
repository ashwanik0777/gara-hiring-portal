import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { isStaffUser, requirePortalCapability } from "@/features/lifecycle/services/lifecycle-service";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { loadLeavePageData } from "@/features/leave/services/leave-page-data";
import { LeaveManagementClient } from "@/features/leave/components/leave-management-client";

export const instant = false;

export const metadata = {
  title: "Leave Management — HRMS Console",
  description: "Request leave and review leave applications.",
};

export default async function HrmsLeavePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/hrms/leave");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  // Interns and employees reach this page through their lifecycle stage; staff keep the team view.
  if (!isStaffUser(user)) {
    await requirePortalCapability("leave", { callbackPath: "/hrms/leave" });
  }

  // Team view only for staff holding `canLeave`; everyone else sees only their own requests.
  const pageData = await loadLeavePageData(user, { allowSelfView: true });
  if (pageData.view === "forbidden") {
    return <UnauthorizedState message={pageData.message} />;
  }

  return (
    <div className="w-full">
      <LeaveManagementClient pageData={pageData} />
    </div>
  );
}
