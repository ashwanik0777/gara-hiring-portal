import React from "react";
import { EvaluationListView } from "@/features/internship-evaluation/components/evaluation-portal-views";

export const instant = false;

/**
 * Authorization (session, role, canEvaluations and supervisor scoping) is performed by
 * EvaluationListView itself; the layout is not relied upon.
 */
export default async function EvaluationsListPage() {
  return <EvaluationListView portal="subadmin" />;
}
