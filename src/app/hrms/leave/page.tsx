import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
} from "lucide-react";

export const instant = false;

export default async function LeaveModulePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center gap-2">
        <Badge variant="warning">Policy Gated (OD-007)</Badge>
        <Badge variant="outline">Non-Calculating Foundation</Badge>
      </div>

      {/* Policy Blocker Warning Banner */}
      <Card className="border-warning/40 bg-warning/5 shadow-xs">
        <CardHeader className="pb-3 border-b border-warning/20">
          <CardTitle className="text-sm font-semibold text-warning flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Policy Gate: Accrual & Balance Engine Paused (OD-007 / D-11)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 text-xs space-y-2 text-foreground/80">
          <p>
            <strong>Unresolved Policy Decisions:</strong> Leave entitlements, monthly vs. annual accruals, carry-forward limits, and encashment terms are undefined.
          </p>
          <p>
            <strong>Safe Active Capabilities:</strong> Leave type catalog definitions and leave request submission/approval workflows are active.
          </p>
        </CardContent>
      </Card>

      {/* Operational Foundations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border shadow-xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Leave Requests & Approvals
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 text-xs text-muted-foreground space-y-3">
            <div className="p-3 rounded-md bg-muted/40 border border-border/40">
              <div className="font-semibold text-foreground mb-1">Standard Operational Protocol:</div>
              Requests capture dates, reason, and leave type. Approvals are recorded with reviewer timestamp and remarks.
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Configurable Leave Categories
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 text-xs text-muted-foreground space-y-3">
            <div className="p-3 rounded-md bg-muted/40 border border-border/40">
              <div className="font-semibold text-foreground mb-1">Policy Isolation:</div>
              Types define whether approval is required and paid status, without inventing statutory balances.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
