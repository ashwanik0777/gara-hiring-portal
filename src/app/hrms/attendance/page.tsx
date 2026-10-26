import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { isStaffUser, requirePortalCapability } from "@/features/lifecycle/services/lifecycle-service";
import { AttendancePageSection } from "@/features/attendance/components/attendance-page-section";
import { AttendancePageSkeleton } from "@/features/attendance/components/attendance-page-skeleton";
import type { RawSearchParams } from "@/features/attendance/services/attendance-page-data";

export const instant = false;

export const metadata = {
  title: "Daily Attendance — HRMS",
  description: "Record daily check-ins and check-outs and review attendance logs.",
};

export default async function AttendanceModulePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/hrms/attendance");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  // Interns and employees reach this page through their lifecycle stage; staff keep the team view.
  if (!isStaffUser(user)) {
    await requirePortalCapability("attendance", { callbackPath: "/hrms/attendance" });
  }

  // Team view only for staff holding `canAttendance`; everyone else sees only their own records.
  return (
    <div className="w-full space-y-6">
      <Suspense fallback={<AttendancePageSkeleton />}>
        <AttendancePageSection user={user} searchParams={searchParams} allowSelfView portalRole="HRMS" />
      </Suspense>
    </div>
  );
}
