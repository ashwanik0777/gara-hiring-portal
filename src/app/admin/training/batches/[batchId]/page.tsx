import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/guards";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { getBatchWorkspace, listMentorCandidates } from "@/features/training/services/batch-staff-service";
import { BatchWorkspaceView, parseWorkspaceTab } from "@/features/training/components/staff/batch-workspace";

export const instant = false;

export const metadata = { title: "Training Batch", robots: { index: false, follow: false } };

type Props = { params: Promise<{ batchId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminTrainingBatchPage({ params, searchParams }: Props) {
  const { batchId } = await params;
  const tab = parseWorkspaceTab((await searchParams).tab);
  if (!z.uuid().safeParse(batchId).success) notFound();
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(`/admin/training/batches/${batchId}`)}`);
  await connection();
  const now = new Date();

  const isAdmin = user.roles.includes(Role.ADMIN);
  let loaded: [Awaited<ReturnType<typeof getBatchWorkspace>>, Awaited<ReturnType<typeof listMentorCandidates>>];
  try {
    loaded = await Promise.all([
      getBatchWorkspace(user, batchId, now),
      isAdmin && tab === "mentors" ? listMentorCandidates(user) : Promise.resolve([]),
    ]);
  } catch (error) {
    if (error instanceof ForbiddenError) return <UnauthorizedState message="Only administrators and this batch's mentors can open it." />;
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const [workspace, mentorCandidates] = loaded;
  return (
    <BatchWorkspaceView
      workspace={workspace}
      tab={tab}
      basePath={`/admin/training/batches/${batchId}`}
      isAdmin={isAdmin}
      mentorCandidates={mentorCandidates}
      now={now}
    />
  );
}
