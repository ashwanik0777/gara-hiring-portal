import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { applicationService } from "@/features/applications/services/application-service";
import { CandidateProfileForm } from "@/features/applications/components/candidate-profile-form";

export const instant = false;

export default async function CandidateProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/candidate/profile");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  const profile = await applicationService.getOrCreateCandidateProfile(user.id);

  return (
    <div className="w-full space-y-6">
      <CandidateProfileForm profile={profile} />
    </div>
  );
}
