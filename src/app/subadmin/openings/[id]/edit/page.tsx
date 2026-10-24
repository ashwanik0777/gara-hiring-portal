import { notFound, redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth/guards";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import {
  getAdminOpeningById,
  type AdminOpeningDetail,
} from "@/features/openings/services/opening-service";
import { openingIdSchema } from "@/features/openings/schemas";
import { OpeningEditorView } from "@/features/openings/components/opening-editor-view";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

interface SubAdminEditOpeningPageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: "Edit Opening & Form — Sub-Admin Workspace",
};

export const instant = false;

export default async function SubAdminEditOpeningPage({ params }: SubAdminEditOpeningPageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/subadmin/openings");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }
  if (!(await hasPermission(user, "canOpenings"))) {
    return <UnauthorizedState message="You do not have permission to manage job openings." />;
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
      return <UnauthorizedState message="You do not have permission to manage job openings." />;
    }
    throw error;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <OpeningEditorView opening={opening} basePath="/subadmin/openings" />
    </div>
  );
}
