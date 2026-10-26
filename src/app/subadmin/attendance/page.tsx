import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { AttendancePageSection } from "@/features/attendance/components/attendance-page-section";
import { AttendancePageSkeleton } from "@/features/attendance/components/attendance-page-skeleton";
import type { RawSearchParams } from "@/features/attendance/services/attendance-page-data";

export const instant = false;

export const metadata = {
  title: "Attendance Management — Sub-Admin Portal",
  description: "Track employee check-ins, check-outs and attendance entries.",
};

export default async function SubAdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/subadmin/attendance");
  if (user.mustChangePassword) redirect("/set-password");

  const hasStaffOrAdminRole = user.roles.some((r) => STAFF_ROLES.includes(r));
  if (!hasStaffOrAdminRole) redirect("/candidate/dashboard");

  // Team view requires the `canAttendance` permission (checked while the section streams).
  return (
    <div className="w-full space-y-6">
      <Suspense fallback={<AttendancePageSkeleton />}>
        <AttendancePageSection user={user} searchParams={searchParams} allowSelfView={false} portalRole="SUBADMIN" />
      </Suspense>
    </div>
  );
}
