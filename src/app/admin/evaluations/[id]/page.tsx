import React from "react";
import { EvaluationCockpitView } from "@/features/internship-evaluation/components/evaluation-portal-views";
import type { RawSearchParams } from "@/features/employees/components/list-search-params";

export const instant = false;

interface EvaluationDetailPageProps {
  params: Promise<{ id: string }>;
  /** `tasksPage` pages the streamed task list. */
  searchParams: Promise<RawSearchParams>;
}

/**
 * Authorization (session, role, canEvaluations and record-level supervisor scoping) is performed
 * by EvaluationCockpitView itself; the layout is not relied upon.
 */
export default async function EvaluationDetailPage({ params, searchParams }: EvaluationDetailPageProps) {
  const { id } = await params;
  return <EvaluationCockpitView portal="admin" enrollmentId={id} searchParams={searchParams} />;
}
