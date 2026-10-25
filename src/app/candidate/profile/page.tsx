import React from "react";
import { requirePortalCapability } from "@/features/lifecycle/services/lifecycle-service";
import { applicationService } from "@/features/applications/services/application-service";
import { CandidateProfileForm } from "@/features/applications/components/candidate-profile-form";

export const instant = false;

export default async function CandidateProfilePage() {
  const { user } = await requirePortalCapability("profile", { callbackPath: "/candidate/profile" });

  const profile = await applicationService.getOrCreateCandidateProfile(user.id);

  return (
    <div className="w-full space-y-6">
      <CandidateProfileForm profile={profile} />
    </div>
  );
}
