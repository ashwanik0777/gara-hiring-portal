import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { getUserPermissions, STAFF_ROLES } from "@/lib/auth/permissions";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
} from "lucide-react";

export const instant = false;

export default async function SubAdminLeavePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/subadmin/leave");

  const hasStaffOrAdminRole = user.roles.some((r) => STAFF_ROLES.includes(r));
  if (!hasStaffOrAdminRole) redirect("/candidate/dashboard");

  const permissions = await getUserPermissions(user.id, user.roles);
  if (!permissions.canLeave) redirect("/subadmin");

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center gap-2">
        <Badge variant="warning">Policy Gated (OD-006)</Badge>
        <Badge variant="outline">Leave Management</Badge>
      </div>

      {/* Decision Notice */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground text-sm">
            Operational Notice: OD-006 Open Decision
          </p>
          <p>
            Leave categories (casual, sick, earned), accrual rules, carry-forward limits, and approval policies
            require sign-off before automatic quota decrements take effect.
          </p>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Leave Applications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">0 Pending</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> All submissions reviewed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Out of Office
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">None</div>
            <p className="text-xs text-muted-foreground mt-1">Staff currently on approved leave</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Policy Types Configured
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">Standard</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <FileText className="h-3.5 w-3.5 text-primary" /> Paid, Casual, Medical
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
