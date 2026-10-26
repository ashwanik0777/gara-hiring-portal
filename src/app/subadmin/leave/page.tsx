import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { LeavePageSection } from "@/features/leave/components/leave-page-section";
import { LeavePageSkeleton } from "@/features/leave/components/leave-page-skeleton";
import type { RawSearchParams } from "@/features/leave/services/leave-page-data";

export const instant = false;

export const metadata = {
  title: "Leave Management — Sub-Admin Console",
  description: "Review leave applications.",
};

export default async function SubAdminLeavePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/subadmin/leave");
  if (user.mustChangePassword) redirect("/set-password");

  const hasStaffOrAdminRole = user.roles.some((r) => STAFF_ROLES.includes(r));
  if (!hasStaffOrAdminRole) redirect("/candidate/dashboard");

  // Team view requires the `canLeave` permission (checked while the section streams).
  return (
    <div className="w-full">
      <Suspense fallback={<LeavePageSkeleton />}>
        <LeavePageSection user={user} searchParams={searchParams} allowSelfView={false} />
      </Suspense>
    </div>
  );
}
