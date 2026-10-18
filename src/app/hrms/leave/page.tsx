import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Role } from "@/types/enums";
import { leaveService } from "@/features/leave/services/leave-service";
import { LeaveManagementClient } from "@/features/leave/components/leave-management-client";

export const instant = false;

export const metadata = {
  title: "Leave Management — HRMS Console",
  description: "Review staff leave applications and manage organization time-off.",
};

export default async function HrmsLeavePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/hrms/leave");
  }

  const isStaffOrAdmin = user.roles.some((r) =>
    ([Role.ADMIN, Role.HR, Role.MANAGER] as Role[]).includes(r)
  );

  if (!isStaffOrAdmin) {
    redirect("/candidate/dashboard");
  }

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
        portalRole="HRMS"
      />
    </div>
  );
}
