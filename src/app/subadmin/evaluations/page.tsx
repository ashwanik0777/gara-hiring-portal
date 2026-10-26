import React from "react";
import { EvaluationListView } from "@/features/internship-evaluation/components/evaluation-portal-views";
import type { RawSearchParams } from "@/features/employees/components/list-search-params";

export const instant = false;

interface EvaluationsListPageProps {
  /** `status` (evaluation status) and `page`. */
  searchParams: Promise<RawSearchParams>;
}

/**
 * Authorization (session, role, canEvaluations and supervisor scoping) is performed by
 * EvaluationListView itself; the layout is not relied upon.
 */
export default async function EvaluationsListPage({ searchParams }: EvaluationsListPageProps) {
  return <EvaluationListView portal="subadmin" searchParams={searchParams} />;
}
