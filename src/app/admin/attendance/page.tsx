import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  AttendanceManagementClient,
  AttendanceRecordItem,
  EmployeeOption,
} from "@/features/attendance/components/attendance-management-client";

export const instant = false;

export const metadata = {
  title: "Attendance & Shift Management — Admin Console",
  description: "Track employee daily punches, check-ins, leaves, and attendance regularizations.",
};

export default async function AdminAttendancePage() {
  const user = await getCurrentUser();
  if (!user || !user.roles.includes(Role.ADMIN)) {
    redirect("/admin");
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

  // Auto-seed admin employee profile if no employees exist yet
  if (employees.length === 0) {
    const existingEmp = await prisma.employee.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        employeeCode: true,
        department: true,
        designation: true,
        user: { select: { name: true, email: true } },
      },
    });

    if (existingEmp) {
      employees.push({
        id: existingEmp.id,
        employeeCode: existingEmp.employeeCode,
        name: existingEmp.user.name,
        email: existingEmp.user.email,
        department: existingEmp.department,
        designation: existingEmp.designation,
      });
    } else {
      const createdEmp = await prisma.employee.create({
        data: {
          userId: user.id,
          employeeCode: "EMP-0001",
          designation: "Executive Administrator",
          department: "Management",
          joiningDate: new Date(),
          status: "ACTIVE",
        },
        select: {
          id: true,
          employeeCode: true,
          department: true,
          designation: true,
          user: { select: { name: true, email: true } },
        },
      });

      employees.push({
        id: createdEmp.id,
        employeeCode: createdEmp.employeeCode,
        name: createdEmp.user.name,
        email: createdEmp.user.email,
        department: createdEmp.department,
        designation: createdEmp.designation,
      });
    }
  }

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
        portalRole="ADMIN"
      />
    </div>
  );
}
