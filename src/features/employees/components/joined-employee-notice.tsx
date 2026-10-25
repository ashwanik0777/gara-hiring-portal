import React from "react";
import Link from "next/link";
import { ArrowRight, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmploymentType } from "@/types/enums";

interface JoinedEmployeeNoticeProps {
  employee: {
    id: string;
    employeeCode: string;
    employmentType: EmploymentType | null;
    joiningDate: Date;
  };
  /** Employee record link, or null when the viewer cannot open employee records. */
  employeeHref: string | null;
}

/** Read-only notice on the staff application page once the person was marked as joined. */
export function JoinedEmployeeNotice({ employee, employeeHref }: JoinedEmployeeNoticeProps) {
  const label =
    employee.employmentType === EmploymentType.INTERN
      ? "Joined as intern"
      : employee.employmentType === EmploymentType.FULL_TIME
        ? "Joined as employee"
        : "Joined";
  const joiningDate = new Date(employee.joiningDate).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <Card className="border-success/30 shadow-xs">
      <CardContent className="flex flex-col gap-3 pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <UserCheck className="h-4 w-4 text-success" aria-hidden="true" />
          <Badge variant="success">{label}</Badge>
          <span>
            Employee code <span className="font-mono text-foreground">{employee.employeeCode}</span> · joined{" "}
            {joiningDate}
          </span>
        </div>
        {employeeHref && (
          <Link href={employeeHref}>
            <Button size="sm" variant="outline" className="gap-1.5">
              Employee record <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
