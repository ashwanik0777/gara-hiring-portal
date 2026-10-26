import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Role } from "@/types/enums";
import { AttendancePageSection } from "@/features/attendance/components/attendance-page-section";
import { AttendancePageSkeleton } from "@/features/attendance/components/attendance-page-skeleton";
import type { RawSearchParams } from "@/features/attendance/services/attendance-page-data";

export const instant = false;

export const metadata = {
  title: "Attendance Management — Admin Console",
  description: "Track employee check-ins, check-outs and attendance entries.",
};

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user || !user.roles.includes(Role.ADMIN)) {
    redirect("/admin");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  return (
    <div className="w-full space-y-6">
      <Suspense fallback={<AttendancePageSkeleton />}>
        <AttendancePageSection user={user} searchParams={searchParams} allowSelfView={false} portalRole="ADMIN" />
      </Suspense>
    </div>
  );
}
