import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/guards";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { getBatchWorkspace } from "@/features/training/services/batch-staff-service";
import { BatchWorkspaceView, parseWorkspaceTab } from "@/features/training/components/staff/batch-workspace";

export const instant = false;

export const metadata = { title: "Training Batch", robots: { index: false, follow: false } };

type Props = { params: Promise<{ batchId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** A mentor's workspace for one assigned batch. */
export default async function MentorTrainingBatchPage({ params, searchParams }: Props) {
  const { batchId } = await params;
  const tab = parseWorkspaceTab((await searchParams).tab);
  if (!z.uuid().safeParse(batchId).success) notFound();
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(`/subadmin/training/${batchId}`)}`);
  await connection();
  const now = new Date();

  let workspace: Awaited<ReturnType<typeof getBatchWorkspace>>;
  try {
    workspace = await getBatchWorkspace(user, batchId, now);
  } catch (error) {
    if (error instanceof ForbiddenError) return <UnauthorizedState message="You are not a mentor of this batch." />;
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  return (
    <BatchWorkspaceView
      workspace={workspace}
      tab={tab === "mentors" ? "students" : tab}
      basePath={`/subadmin/training/${batchId}`}
      isAdmin={false}
      mentorCandidates={[]}
      now={now}
    />
  );
}
