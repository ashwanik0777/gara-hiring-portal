import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Role } from "@prisma/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Calendar,
  FileCheck,
} from "lucide-react";

export const instant = false;

export default async function AdminPayrollPage() {
  const user = await getCurrentUser();
  if (!user || !user.roles.includes(Role.ADMIN)) {
    redirect("/admin");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Badge variant="warning">Policy Gated (OD-007)</Badge>
        <Badge variant="outline">Admin Finance Module</Badge>
      </div>

      {/* Policy Blocker Warning Banner */}
      <Card className="border-warning/40 bg-warning/5 shadow-xs">
        <CardHeader className="pb-3 border-b border-warning/20">
          <CardTitle className="text-sm font-semibold text-warning flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Policy Gate: Salary & Deduction Engine Paused (OD-007)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 text-xs space-y-2 text-foreground/80">
          <p>
            <strong>Mandatory Governance Requirement:</strong> See <code className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono">docs/PAYROLL_REQUIREMENTS.md</code> for the formal requirements checklist covering scope selection (records/export vs calculation engine), statutory deductions, and legal validation.
          </p>
          <p>
            <strong>Safe Active Capabilities:</strong> Period cycle tracking (e.g. 2026-04) and bank payout reference logging are active.
          </p>
        </CardContent>
      </Card>

      {/* Operational Foundations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border shadow-xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" /> Payroll Period Cycles
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 text-xs text-muted-foreground space-y-3">
            <div className="p-3 rounded-md bg-muted/40 border border-border/40">
              <div className="font-semibold text-foreground mb-1">Cycle Tracking:</div>
              Defines operational start/end windows for record keeping and audit logging.
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-primary" /> Disbursement Records
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 text-xs text-muted-foreground space-y-3">
            <div className="p-3 rounded-md bg-muted/40 border border-border/40">
              <div className="font-semibold text-foreground mb-1">Disbursement Verification:</div>
              Records payout transaction references and authorizations without displaying fabricated tax slips.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
