import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { Role } from "@prisma/client";
import { getAdminOpeningById } from "@/features/openings/services/opening-service";
import { OpeningStatusActions } from "@/features/openings/components/opening-status-actions";
import { FormBuilder } from "@/features/application-forms/components/form-builder";
import { FormSchemaDefinition } from "@/features/application-forms/types";
import { Navbar } from "@/components/navigation/navbar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ArrowLeft, Eye, Settings, FileSpreadsheet } from "lucide-react";

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

  if (!user || (!user.roles.includes(Role.ADMIN) && !user.roles.includes(Role.HR))) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-8">
          <UnauthorizedState message="You require Administrator or HR credentials to edit openings." />
        </div>
      </div>
    );
  }

  let opening;
  try {
    opening = await getAdminOpeningById(id, user);
  } catch {
    notFound();
  }

  const latestFormVersion = opening.formVersions[0];
  const initialSchema = (latestFormVersion?.schemaDefinition as unknown as FormSchemaDefinition) ?? {
    sections: [],
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />

      <main className="flex-1 py-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          {/* Back Link & Header */}
          <div>
            <Link
              href="/admin/openings"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-4 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Openings List
            </Link>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/70 pb-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  {opening.title}
                </h1>
              </div>

              <div className="flex items-center gap-2">
                <Link href={`/admin/openings/${opening.id}/preview`}>
                  <button className="inline-flex items-center justify-center font-medium rounded-lg border border-border bg-card hover:bg-accent text-xs h-9 px-3 gap-1.5 cursor-pointer">
                    <Eye className="h-3.5 w-3.5" />
                    Preview Live Appearance
                  </button>
                </Link>
              </div>
            </div>
          </div>

          {/* Section 1: Opening Lifecycle & Status Controls */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4 text-primary" />
                Vacancy Lifecycle Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <OpeningStatusActions openingId={opening.id} currentStatus={opening.status} />
            </CardContent>
          </Card>

          {/* Section 2: Dynamic Form Builder */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                Dynamic Application Form Builder
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FormBuilder
                openingId={opening.id}
                initialSchema={initialSchema}
                currentVersionNumber={latestFormVersion?.versionNumber ?? 1}
                isOpeningPublished={opening.status === "PUBLISHED"}
              />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
