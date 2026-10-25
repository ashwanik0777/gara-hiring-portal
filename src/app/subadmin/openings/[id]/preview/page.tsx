import { notFound, redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth/guards";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import {
  getAdminOpeningById,
  type AdminOpeningDetail,
} from "@/features/openings/services/opening-service";
import { openingIdSchema } from "@/features/openings/schemas";
import { env } from "@/lib/env";
import { OpeningPreviewView } from "@/features/openings/components/opening-preview-view";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { Eye } from "lucide-react";

interface SubAdminPreviewOpeningPageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: "Preview Opening — Sub-Admin Workspace",
};

export const instant = false;

export default async function SubAdminPreviewOpeningPage({
  params,
}: SubAdminPreviewOpeningPageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/subadmin/openings");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }
  if (!(await hasPermission(user, "canOpenings"))) {
    return <UnauthorizedState message="You do not have permission to view job openings." />;
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
      return <UnauthorizedState message="You do not have permission to view job openings." />;
    }
    throw error;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="rounded-lg bg-primary/10 border border-primary/20 py-2.5 px-4 text-center text-xs font-medium text-foreground flex items-center justify-center gap-2">
        <Eye className="h-4 w-4 text-primary" />
        <span>
          Preview Mode — Viewing Opening: <span className="font-semibold">{opening.title}</span> (
          Status: {opening.status})
        </span>
      </div>
      <OpeningPreviewView opening={opening} basePath="/subadmin/openings" documentMode={env.DOCUMENT_STORAGE_MODE} />
    </div>
  );
}
