import { redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth/guards";
import { getAdminOpenings } from "@/features/openings/services/opening-service";
import { listTracksForStaff } from "@/features/openings/services/track-service";
import {
  OpeningsOverview,
  parseOpeningStatusFilter,
  toTrackRows,
} from "@/features/openings/components/openings-overview";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { ForbiddenError } from "@/lib/errors";

export const instant = false;

interface SubAdminOpeningsPageProps {
  /** `status`: DRAFT, PUBLISHED, PAUSED or CLOSED. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SubAdminOpeningsPage({ searchParams }: SubAdminOpeningsPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/subadmin/openings");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  // Page-level guard: the granular `canOpenings` permission is the gate (layouts are not a
  // security boundary). Candidates and staff without it are refused.
  if (!(await hasPermission(user, "canOpenings"))) {
    return <UnauthorizedState message="You do not have permission to manage job openings." />;
  }

  let openings: Awaited<ReturnType<typeof getAdminOpenings>>;
  let tracks: ReturnType<typeof toTrackRows>;
  try {
    [openings, tracks] = await Promise.all([getAdminOpenings(user), listTracksForStaff(user).then(toTrackRows)]);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return <UnauthorizedState message="You do not have permission to manage job openings." />;
    }
    throw error;
  }

  const params = await searchParams;
  return (
    <OpeningsOverview
      openings={openings}
      tracks={tracks}
      basePath="/subadmin/openings"
      status={parseOpeningStatusFilter(params.status)}
      now={new Date()}
    />
  );
}
