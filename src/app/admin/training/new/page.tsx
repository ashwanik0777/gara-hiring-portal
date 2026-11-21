import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/guards";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { listActiveTracks } from "@/features/openings/services/track-service";
import { TrainingProgramForm } from "@/features/training/components/program-form";

export const instant = false;

export const metadata = { title: "New programme", robots: { index: false, follow: false } };

/** Rendered inside the admin portal shell, which provides the title and "Back to Training". */
export default async function AdminNewTrainingProgramPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/admin/training/new");
  // The create action re-checks; this only avoids showing the form to non-administrators.
  if (!user.roles.includes(Role.ADMIN)) {
    return <UnauthorizedState message="Only administrators can manage Industrial Training." />;
  }

  const tracks = await listActiveTracks();
  return <TrainingProgramForm tracks={tracks.map((track) => ({ id: track.id, name: track.name }))} />;
}
