import React from "react";
import { EvaluationCockpitView } from "@/features/internship-evaluation/components/evaluation-portal-views";

export const instant = false;

interface EvaluationDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Authorization (session, role, canEvaluations and record-level supervisor scoping) is performed
 * by EvaluationCockpitView itself; the layout is not relied upon.
 */
export default async function EvaluationDetailPage({ params }: EvaluationDetailPageProps) {
  const { id } = await params;
  return <EvaluationCockpitView portal="subadmin" enrollmentId={id} />;
}
