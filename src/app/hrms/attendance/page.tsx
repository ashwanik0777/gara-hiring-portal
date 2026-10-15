import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import {
  AttendanceManagementClient,
  AttendanceRecordItem,
  EmployeeOption,
} from "@/features/attendance/components/attendance-management-client";

export const instant = false;

export const metadata = {
  title: "Daily Attendance & Time Tracking — HRMS",
  description: "Record daily employee check-ins, check-outs, leaves, and time tracking logs.",
};

export default async function AttendanceModulePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/hrms/attendance");
  }

  // 1. Fetch active employees
  const rawEmployees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      employeeCode: true,
      department: true,
      designation: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: { employeeCode: "asc" },
  });

  const employees: EmployeeOption[] = rawEmployees.map((e) => ({
    id: e.id,
    employeeCode: e.employeeCode,
    name: e.user.name,
    email: e.user.email,
    department: e.department,
    designation: e.designation,
  }));

  // 2. Fetch daily attendance records
  const rawRecords = await prisma.attendanceRecord.findMany({
    include: {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          department: true,
          designation: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
    },
    orderBy: { date: "desc" },
    take: 100,
  });

  const initialRecords: AttendanceRecordItem[] = rawRecords.map((r) => ({
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employee.user.name,
    employeeCode: r.employee.employeeCode,
    department: r.employee.department,
    designation: r.employee.designation,
    date: r.date.toISOString(),
    checkInTime: r.checkInTime ? r.checkInTime.toISOString() : null,
    checkOutTime: r.checkOutTime ? r.checkOutTime.toISOString() : null,
    status: r.status,
    entryMethod: r.entryMethod,
    notes: r.notes,
  }));

  return (
    <div className="w-full space-y-6">
      <AttendanceManagementClient
        initialRecords={initialRecords}
        employees={employees}
        currentUserId={user.id}
        portalRole="HRMS"
      />
    </div>
  );
}
