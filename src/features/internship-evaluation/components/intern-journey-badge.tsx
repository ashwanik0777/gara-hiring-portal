import React from "react";
import { Badge } from "@/components/ui/badge";
import { INTERN_JOURNEY_LABELS, type InternJourneyState } from "../joining-state";

const JOURNEY_BADGE_VARIANT: Record<InternJourneyState, "success" | "warning" | "secondary" | "destructive"> = {
  SELECTED: "secondary",
  PASSED_AWAITING_JOINING: "warning",
  JOINED: "success",
  JOINED_AS_EMPLOYEE: "success",
  NOT_PASSED: "destructive",
};

/** Staff label for the selection → evaluation → joining journey of an internship candidate. */
export function InternJourneyBadge({ state }: { state: InternJourneyState }) {
  return <Badge variant={JOURNEY_BADGE_VARIANT[state]}>{INTERN_JOURNEY_LABELS[state]}</Badge>;
}
