import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/guards";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { getProgramForStaff, type StaffTrainingProgram } from "@/features/training/services/program-service";
import { listActiveTracks } from "@/features/openings/services/track-service";
import { TrainingProgramForm } from "@/features/training/components/program-form";
import { BatchManager } from "@/features/training/components/batch-manager";
import { toBatchRows, toProgramFormValues } from "@/features/training/form-values";

export const instant = false;

export const metadata = { title: "Manage programme", robots: { index: false, follow: false } };

export default async function AdminTrainingProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=/admin/training/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();

  let program: StaffTrainingProgram;
  try {
    program = await getProgramForStaff(id, user);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    if (error instanceof ForbiddenError) return <UnauthorizedState message="Only administrators can manage Industrial Training." />;
    throw error;
  }
  const tracks = await listActiveTracks();

  return (
    <div className="w-full space-y-6">
      <Link href="/admin/training" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> All programmes
      </Link>
      <h2 className="text-2xl font-bold tracking-tight">{program.title}</h2>
      <TrainingProgramForm
        programId={program.id}
        initial={toProgramFormValues(program)}
        tracks={tracks.map((track) => ({ id: track.id, name: track.name }))}
      />
      <BatchManager programId={program.id} programSlug={program.slug} batches={toBatchRows(program)} />
    </div>
  );
}
