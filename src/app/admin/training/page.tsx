import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { ForbiddenError } from "@/lib/errors";
import { getTrainingOverviewForStaff, type TrainingOverview } from "@/features/training/services/program-service";
import { parseProgramStatusFilter, TrainingOverviewView } from "@/features/training/components/training-overview";

export const instant = false;

export const metadata = { title: "Industrial Training", robots: { index: false, follow: false } };

interface AdminTrainingPageProps {
  /** `status`: DRAFT, PUBLISHED or ARCHIVED. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminTrainingPage({ searchParams }: AdminTrainingPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/admin/training");

  let overview: TrainingOverview;
  try {
    overview = await getTrainingOverviewForStaff(user);
  } catch (error) {
    if (error instanceof ForbiddenError) return <UnauthorizedState message="Only administrators can manage Industrial Training." />;
    throw error;
  }

  return <TrainingOverviewView overview={overview} status={parseProgramStatusFilter((await searchParams).status)} />;
}
