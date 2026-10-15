import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/guards";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { Role } from "@prisma/client";
import { OpeningForm } from "@/features/openings/components/opening-form";
import { Navbar } from "@/components/navigation/navbar";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Create Vacancy — Recruitment Admin",
};

export const instant = false;

export default async function NewOpeningPage() {
  const user = await getCurrentUser();

  if (!user || (!user.roles.includes(Role.ADMIN) && !user.roles.includes(Role.HR))) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-8">
          <UnauthorizedState message="You require Administrator or HR credentials to create openings." />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />

      <main className="flex-1 py-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <Link
            href="/admin/openings"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Openings List
          </Link>

          <div>
            <h1 className="text-2xl font-bold tracking-tight">Create New Program Vacancy</h1>
          </div>

          <OpeningForm />
        </div>
      </main>
    </div>
  );
}
