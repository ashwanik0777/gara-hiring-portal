import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listStaffBatches } from "@/features/training/services/batch-staff-service";
import { formatBatchDay } from "@/features/training/components/batch-dates";

export const instant = false;

export const metadata = { title: "Training Batches", robots: { index: false, follow: false } };

/** Industrial Training batches this mentor is assigned to. */
export default async function MentorTrainingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/subadmin/training");

  let batches: Awaited<ReturnType<typeof listStaffBatches>>;
  try {
    batches = await listStaffBatches(user);
  } catch (error) {
    if (error instanceof ForbiddenError) return <UnauthorizedState message="Training batches are for mentors." />;
    throw error;
  }

  return (
    <div className="w-full space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Training Batches</h2>
        <p className="text-sm text-muted-foreground">Industrial Training batches you mentor: classes, attendance, assignments, projects, demos and results.</p>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Your batches ({batches.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">You are not assigned to a batch yet. An administrator assigns mentors to batches.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {batches.map((batch) => (
                <li key={batch.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <Link href={`/subadmin/training/${batch.id}`} className="font-medium hover:underline underline-offset-4">
                      {batch.program.title} · {batch.name}
                    </Link>{" "}
                    <Badge variant="outline">{batch.status.toLowerCase()}</Badge>
                    <p className="text-xs text-muted-foreground">
                      Starts {formatBatchDay(batch.startDate)} · {batch._count.enrollments} student{batch._count.enrollments === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Link href={`/subadmin/training/${batch.id}`} className="text-sm font-medium text-primary hover:underline underline-offset-4">
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
