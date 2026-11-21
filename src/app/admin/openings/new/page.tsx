import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { Role } from "@prisma/client";
import { OpeningForm } from "@/features/openings/components/opening-form";
import { getTrackOptions } from "@/features/openings/services/track-service";

export const metadata = {
  title: "Create Opening — Recruitment Admin",
};

export const instant = false;

/** Rendered inside the admin portal shell, which provides the title and "Back to Openings". */
export default async function NewOpeningPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/admin/openings/new");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  // Page-level guard: the /admin portal is restricted to Super Administrators.
  if (!user.roles.includes(Role.ADMIN)) {
    return <UnauthorizedState message="The administrator portal is restricted to Super Administrators." />;
  }

  return (
    <div className="w-full">
      <OpeningForm basePath="/admin/openings" tracks={await getTrackOptions(user)} />
    </div>
  );
}
