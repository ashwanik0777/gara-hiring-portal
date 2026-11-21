import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { Role } from "@prisma/client";
import {
  getAdminOpeningById,
  type AdminOpeningDetail,
} from "@/features/openings/services/opening-service";
import { openingIdSchema } from "@/features/openings/schemas";
import { OpeningEditorView } from "@/features/openings/components/opening-editor-view";
import { getTrackOptions } from "@/features/openings/services/track-service";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

interface EditOpeningPageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: "Edit Opening & Form — Recruitment Admin",
};

export const instant = false;

export default async function EditOpeningPage({ params }: EditOpeningPageProps) {
  const { id } = await params;
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

  if (!openingIdSchema.safeParse(id).success) {
    notFound();
  }

  let opening: AdminOpeningDetail;
  try {
    opening = await getAdminOpeningById(id, user);
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    if (error instanceof ForbiddenError) {
      return <UnauthorizedState message="You do not have permission to manage openings." />;
    }
    throw error;
  }

  return (
    <div className="w-full">
      <OpeningEditorView
        opening={opening}
        basePath="/admin/openings"
        tracks={await getTrackOptions(user, opening.trackId)}
      />
    </div>
  );
}
