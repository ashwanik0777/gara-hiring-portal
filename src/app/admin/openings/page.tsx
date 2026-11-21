import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Role } from "@prisma/client";
import { getAdminOpenings } from "@/features/openings/services/opening-service";
import { listTracksForStaff } from "@/features/openings/services/track-service";
import {
  OpeningsOverview,
  parseOpeningStatusFilter,
  toTrackRows,
} from "@/features/openings/components/openings-overview";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";

export const instant = false;

export const metadata = {
  title: "Openings Management — Recruitment Admin",
  description: "Manage vacancy lifecycles, dynamic application forms, and publishing states.",
};

interface AdminOpeningsPageProps {
  /** `status`: DRAFT, PUBLISHED, PAUSED or CLOSED. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminOpeningsPage({ searchParams }: AdminOpeningsPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/admin/openings");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  // Page-level guard: the /admin portal is restricted to Super Administrators.
  if (!user.roles.includes(Role.ADMIN)) {
    return <UnauthorizedState message="The administrator portal is restricted to Super Administrators." />;
  }

  const [openings, tracks, params] = await Promise.all([
    getAdminOpenings(user),
    listTracksForStaff(user).then(toTrackRows),
    searchParams,
  ]);

  return (
    <OpeningsOverview
      openings={openings}
      tracks={tracks}
      basePath="/admin/openings"
      status={parseOpeningStatusFilter(params.status)}
      now={new Date()}
    />
  );
}
