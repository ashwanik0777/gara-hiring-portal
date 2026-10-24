import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth/guards";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { OpeningForm } from "@/features/openings/components/opening-form";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Create Vacancy — Sub-Admin Workspace",
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
    <div className="max-w-4xl mx-auto space-y-6">
      <Link
        href="/subadmin/openings"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Openings List
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Create New Program Vacancy</h1>
      </div>

      <OpeningForm basePath="/subadmin/openings" />
    </div>
  );
}
