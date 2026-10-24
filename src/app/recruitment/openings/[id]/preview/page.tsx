import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { Role } from "@prisma/client";
import {
  getAdminOpeningById,
  type AdminOpeningDetail,
} from "@/features/openings/services/opening-service";
import { openingIdSchema } from "@/features/openings/schemas";
import { OpeningPreviewView } from "@/features/openings/components/opening-preview-view";
import { Navbar } from "@/components/navigation/navbar";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { Eye } from "lucide-react";

interface PreviewOpeningPageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: "Preview Opening — Recruitment Admin",
};

export const instant = false;

export default async function PreviewOpeningPage({ params }: PreviewOpeningPageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/admin/openings");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  // Legacy /recruitment route (redirected to /admin by next.config.ts): same guard as /admin.
  if (!user.roles.includes(Role.ADMIN)) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-8">
          <UnauthorizedState message="The administrator portal is restricted to Super Administrators." />
        </div>
      </div>
    );
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
      return <UnauthorizedState message="You do not have permission to view openings." />;
    }
    throw error;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />

      {/* Admin Preview Top Banner */}
      <div className="bg-primary/10 border-b border-primary/20 py-2.5 px-4 text-center text-xs font-medium text-foreground flex items-center justify-center gap-2">
        <Eye className="h-4 w-4 text-primary" />
        <span>
          Admin Preview Mode — Viewing Opening: <span className="font-semibold">{opening.title}</span> (
          Status: {opening.status})
        </span>
      </div>

      <main className="flex-1 py-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <OpeningPreviewView opening={opening} basePath="/admin/openings" />
        </div>
      </main>
    </div>
  );
}
