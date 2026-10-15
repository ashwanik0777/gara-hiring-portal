import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Role } from "@prisma/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
} from "lucide-react";

export const instant = false;

export default async function AdminLeavePage() {
  const user = await getCurrentUser();
  if (!user || !user.roles.includes(Role.ADMIN)) {
    redirect("/admin");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Badge variant="warning">Policy Gated (OD-006)</Badge>
        <Badge variant="outline">Admin HRMS Module</Badge>
      </div>

      {/* Policy Blocker Warning Banner */}
      <Card className="border-warning/40 bg-warning/5 shadow-xs">
        <CardHeader className="pb-3 border-b border-warning/20">
          <CardTitle className="text-sm font-semibold text-warning flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Policy Gate: Leave Balances & Accrual Rules Paused (OD-006)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 text-xs space-y-2 text-foreground/80">
          <p>
            <strong>Unresolved Policy Decisions:</strong> Leave types (casual, sick, earned), accrual rules, carry-forward limits, and approval workflows have not been approved by the Product Owner.
          </p>
          <p>
            <strong>Safe Active Capabilities:</strong> Request submission and approval/rejection audit tracking are available.
          </p>
        </CardContent>
      </Card>

      {/* Operational Foundations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border shadow-xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Leave Types Directory
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 text-xs text-muted-foreground space-y-3">
            <div className="p-3 rounded-md bg-muted/40 border border-border/40">
              <div className="font-semibold text-foreground mb-1">Standard Operational Protocol:</div>
              Standard categories defined without hardcoded accrual rates until OD-006 policy sign-off is completed.
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Approval Governance
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 text-xs text-muted-foreground space-y-3">
            <div className="p-3 rounded-md bg-muted/40 border border-border/40">
              <div className="font-semibold text-foreground mb-1">Dual Stage Review:</div>
              Managers and HR hold multi-tier sign-off rights with audit trail logging.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
