import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Role } from "@/types/enums";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { loadLeavePageData } from "@/features/leave/services/leave-page-data";
import { LeaveManagementClient } from "@/features/leave/components/leave-management-client";

export const instant = false;

export const metadata = {
  title: "Leave Management — Admin Console",
  description: "Review leave requests and manage leave categories.",
};

export default async function AdminLeavePage() {
  const user = await getCurrentUser();
  if (!user || !user.roles.includes(Role.ADMIN)) {
    redirect("/admin");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

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
