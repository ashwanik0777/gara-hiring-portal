import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Role } from "@/types/enums";
import { LeavePageSection } from "@/features/leave/components/leave-page-section";
import { LeavePageSkeleton } from "@/features/leave/components/leave-page-skeleton";
import type { RawSearchParams } from "@/features/leave/services/leave-page-data";

export const instant = false;

export const metadata = {
  title: "Leave Management — Admin Console",
  description: "Review leave requests and manage leave categories.",
};

export default async function AdminLeavePage({
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
    <div className="w-full">
      <Suspense fallback={<LeavePageSkeleton />}>
        <LeavePageSection user={user} searchParams={searchParams} allowSelfView={false} />
      </Suspense>
    </div>
  );
}
