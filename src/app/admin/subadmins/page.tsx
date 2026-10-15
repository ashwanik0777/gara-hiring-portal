import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { Role } from "@prisma/client";
import { SUB_ADMIN_ROLES } from "@/lib/auth/permissions";
import {
  SubAdminManagementClient,
  SubAdminItem,
} from "@/features/subadmins/components/subadmin-management-client";

export const instant = false;

export default async function AdminSubAdminsPage() {
  const user = await getCurrentUser();
  if (!user || !user.roles.includes(Role.ADMIN)) {
    redirect("/admin");
  }

  const staffUsers = await prisma.user.findMany({
    where: {
      roles: {
        some: {
          role: {
            in: SUB_ADMIN_ROLES,
          },
        },
      },
    },
    include: {
      roles: true,
      subAdminPermission: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const formattedSubAdmins: SubAdminItem[] = staffUsers.map((u) => {
    const staffRole =
      u.roles.find((r) => SUB_ADMIN_ROLES.includes(r.role))?.role || Role.HR;

    const perms = u.subAdminPermission || {
      canApplications: true,
      canOpenings: false,
      canInterviews: true,
      canEvaluations: false,
      canEmployees: false,
      canAttendance: false,
      canLeave: false,
      canPayroll: false,
      canReports: false,
    };

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: staffRole,
      createdAt: u.createdAt.toISOString(),
      permissions: {
        canApplications: perms.canApplications,
        canOpenings: perms.canOpenings,
        canInterviews: perms.canInterviews,
        canEvaluations: perms.canEvaluations,
        canEmployees: perms.canEmployees,
        canAttendance: perms.canAttendance,
        canLeave: perms.canLeave,
        canPayroll: perms.canPayroll,
        canReports: perms.canReports,
      },
    };
  });

  return (
    <div className="space-y-6">
      <SubAdminManagementClient initialSubAdmins={formattedSubAdmins} />
    </div>
  );
}
