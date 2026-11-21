import { redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth/guards";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { OpeningForm } from "@/features/openings/components/opening-form";
import { getTrackOptions } from "@/features/openings/services/track-service";

export const metadata = {
  title: "Create Opening — Sub-Admin Workspace",
};

export const instant = false;

export default async function SubAdminNewOpeningPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/subadmin/openings/new");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }
  if (!(await hasPermission(user, "canOpenings"))) {
    return <UnauthorizedState message="You do not have permission to manage job openings." />;
  }

  return (
    <div className="w-full">
      <OpeningForm basePath="/subadmin/openings" tracks={await getTrackOptions(user)} />
    </div>
  );
}
