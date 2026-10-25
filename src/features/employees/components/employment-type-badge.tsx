import React from "react";
import { Badge } from "@/components/ui/badge";
import { EmploymentType } from "@/types/enums";

/** How the person joined (intern or full-time); nothing for records created before the field existed. */
export function EmploymentTypeBadge({ employmentType }: { employmentType: EmploymentType | null }) {
  if (employmentType === EmploymentType.INTERN) {
    return <Badge variant="outline">Intern</Badge>;
  }
  if (employmentType === EmploymentType.FULL_TIME) {
    return <Badge variant="outline">Full-time</Badge>;
  }
  return null;
}
