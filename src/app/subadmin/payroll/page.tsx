import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { getUserPermissions, STAFF_ROLES } from "@/lib/auth/permissions";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck,
} from "lucide-react";

export const instant = false;

export default async function SubAdminPayrollPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/subadmin/payroll");

  const hasStaffOrAdminRole = user.roles.some((r) => STAFF_ROLES.includes(r));
  if (!hasStaffOrAdminRole) redirect("/candidate/dashboard");

  const permissions = await getUserPermissions(user.id, user.roles);
  if (!permissions.canPayroll) redirect("/subadmin");

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center gap-2">
        <Badge variant="warning">Policy Gated (OD-007)</Badge>
        <Badge variant="outline">Payroll Module</Badge>
      </div>

      {/* Decision Notice */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground text-sm">
            Operational Notice: OD-007 Open Decision
          </p>
          <p>
            Salary structure definitions, statutory tax brackets (PF/ESI/TDS), and payroll calculation formulas
            must not be assumed and require final product configuration before generation is unlocked.
          </p>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Current Pay Cycle
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">Monthly</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Cycle structure standard
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Disbursement Register
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">Pending Approval</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting batch sign-off</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Payslip Archive
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">Encrypted</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <FileCheck className="h-3.5 w-3.5 text-primary" /> Tamper-evident records
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
