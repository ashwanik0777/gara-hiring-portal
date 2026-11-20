import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { ForbiddenError } from "@/lib/errors";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listProgramsForStaff } from "@/features/training/services/program-service";
import { listActiveTracks } from "@/features/openings/services/track-service";
import { TrainingProgramForm } from "@/features/training/components/program-form";
import { formatInr } from "@/features/training/money";
import { ExportLinks } from "@/features/exports/export-links";

export const instant = false;

export const metadata = { title: "Industrial Training", robots: { index: false, follow: false } };

export default async function AdminTrainingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/admin/training");

  let programs: Awaited<ReturnType<typeof listProgramsForStaff>>;
  try {
    programs = await listProgramsForStaff(user);
  } catch (error) {
    if (error instanceof ForbiddenError) return <UnauthorizedState message="Only administrators can manage Industrial Training." />;
    throw error;
  }
  const tracks = await listActiveTracks();

  return (
    <div className="w-full space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Industrial Training</h2>
        <p className="text-sm text-muted-foreground">Paid programmes and their batches. Published programmes appear on /training.</p>
        <div className="mt-3">
          <ExportLinks
            items={[
              { dataset: "training-enrollments", label: "Enrollments CSV" },
              { dataset: "training-payments", label: "Payments CSV" },
              { dataset: "certificates", label: "Certificates CSV" },
            ]}
          />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Programmes</CardTitle>
        </CardHeader>
        <CardContent>
          {programs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No programmes yet. Create the first one below.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {programs.map((program) => (
                <li key={program.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link href={`/admin/training/${program.id}`} className="font-medium text-foreground hover:underline underline-offset-4">
                      {program.title}
                    </Link>{" "}
                    <Badge variant={program.status === "PUBLISHED" ? "success" : "outline"} className="ml-1">
                      {program.status}
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      {formatInr(program.feePaise)} · {program.durationWeeks} weeks · {program._count.batches} batch
                      {program._count.batches === 1 ? "" : "es"} · /training/{program.slug}
                    </p>
                  </div>
                  <Link href={`/admin/training/${program.id}`} className="text-sm font-medium text-primary hover:underline underline-offset-4">
                    Manage
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <TrainingProgramForm tracks={tracks.map((track) => ({ id: track.id, name: track.name }))} />
    </div>
  );
}
