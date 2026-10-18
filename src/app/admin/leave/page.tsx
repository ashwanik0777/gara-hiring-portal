import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Role } from "@/types/enums";
import { prisma } from "@/lib/db";
import { leaveService } from "@/features/leave/services/leave-service";
import { LeaveManagementClient } from "@/features/leave/components/leave-management-client";

export const instant = false;

export const metadata = {
  title: "Leave & Time-Off Management — Admin Console",
  description: "Review leave requests, approve absences, and manage company leave policies.",
};

export default async function AdminLeavePage() {
  const user = await getCurrentUser();
  if (!user || !user.roles.includes(Role.ADMIN)) {
    redirect("/admin");
  }

  // Ensure default leave categories exist in DB
  await leaveService.ensureDefaultLeaveTypes();

  // Ensure the current user has an Employee record if no employees exist yet
  const employeeCount = await prisma.employee.count();
  if (employeeCount === 0) {
    const existingEmp = await prisma.employee.findUnique({
      where: { userId: user.id },
    });
    if (!existingEmp) {
      await prisma.employee.create({
        data: {
          userId: user.id,
          employeeCode: "EMP-ADMIN-001",
          department: "Operations & HR",
          designation: "Principal Administrator",
          status: "ACTIVE",
          joiningDate: new Date(),
        },
      });
    }
  }

  // Fetch data in parallel
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
        portalRole="ADMIN"
      />
    </div>
  );
}
