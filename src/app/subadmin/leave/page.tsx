import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { getUserPermissions, STAFF_ROLES } from "@/lib/auth/permissions";
import { leaveService } from "@/features/leave/services/leave-service";
import { LeaveManagementClient } from "@/features/leave/components/leave-management-client";

export const instant = false;

export const metadata = {
  title: "Leave Management — Sub-Admin Console",
  description: "Review staff leave applications and manage department time-off.",
};

export default async function SubAdminLeavePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/subadmin/leave");

  const hasStaffOrAdminRole = user.roles.some((r) => STAFF_ROLES.includes(r));
  if (!hasStaffOrAdminRole) redirect("/candidate/dashboard");

  const permissions = await getUserPermissions(user.id, user.roles);
  if (!permissions.canLeave) redirect("/subadmin");

  await leaveService.ensureDefaultLeaveTypes();

  const [stats, leaveTypes, requests, employees] = await Promise.all([
    leaveService.getLeaveStats(),
    leaveService.getLeaveTypes(true),
    leaveService.getAllLeaveRequests(user),
    leaveService.getEmployeeOptions(),
  ]);

  return (
    <div className="w-full">
      <LeaveManagementClient
        initialRequests={requests}
        leaveTypes={leaveTypes}
        stats={stats}
        employees={employees}
        currentUserId={user.id}
        portalRole="SUBADMIN"
      />
    </div>
  );
}
