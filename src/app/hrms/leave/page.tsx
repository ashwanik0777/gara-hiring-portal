import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { isStaffUser, requirePortalCapability } from "@/features/lifecycle/services/lifecycle-service";
import { LeavePageSection } from "@/features/leave/components/leave-page-section";
import { LeavePageSkeleton } from "@/features/leave/components/leave-page-skeleton";
import type { RawSearchParams } from "@/features/leave/services/leave-page-data";

export const instant = false;

export const metadata = {
  title: "Leave Management — HRMS Console",
  description: "Request leave and review leave applications.",
};

export default async function HrmsLeavePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/hrms/leave");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  // Interns and employees reach this page through their lifecycle stage; staff keep the team view.
  if (!isStaffUser(user)) {
    await requirePortalCapability("leave", { callbackPath: "/hrms/leave" });
  }

  // Team view only for staff holding `canLeave`; everyone else sees only their own requests.
  return (
    <div className="w-full">
      <Suspense fallback={<LeavePageSkeleton />}>
        <LeavePageSection user={user} searchParams={searchParams} allowSelfView />
      </Suspense>
    </div>
  );
}
