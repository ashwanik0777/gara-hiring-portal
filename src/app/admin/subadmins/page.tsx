import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Role } from "@prisma/client";
import {
  SubAdminsPageSection,
  type RawSearchParams,
} from "@/features/subadmins/components/subadmins-page-section";
import { SubAdminsPageSkeleton } from "@/features/subadmins/components/subadmins-page-skeleton";

export const instant = false;

export const metadata = {
  title: "Sub-Admins — Admin Console",
  description: "Provision staff accounts and manage their module permissions.",
};

export default async function AdminSubAdminsPage({
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
    <div className="space-y-6">
      <Suspense fallback={<SubAdminsPageSkeleton />}>
        <SubAdminsPageSection user={user} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
