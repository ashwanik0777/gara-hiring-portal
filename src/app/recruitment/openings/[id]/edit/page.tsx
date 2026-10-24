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
import { Navbar } from "@/components/navigation/navbar";
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
      return <UnauthorizedState message="You do not have permission to manage openings." />;
    }
    throw error;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />

      <main className="flex-1 py-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <OpeningEditorView opening={opening} basePath="/admin/openings" />
        </div>
      </main>
    </div>
  );
}
