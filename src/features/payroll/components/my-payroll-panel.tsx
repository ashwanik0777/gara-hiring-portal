import React from "react";
import { CreditCard, Building } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PaginationNav } from "@/components/ui/pagination-nav";
import type { MyPayrollOverview } from "../types";

const NOT_CONFIGURED = "Not configured";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatAmount(amount: number | null): string {
  if (amount === null) return NOT_CONFIGURED;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Read-only self-service payroll view. Receives only the signed-in employee's own
 * records with account number and PAN already masked on the server.
 */
export function MyPayrollPanel({
  overview,
  basePath,
}: {
  overview: MyPayrollOverview;
  /** Route of the page, used for the record pagination links. */
  basePath: string;
}) {
  if (!overview.employee) {
    return (
      <Card className="rounded-2xl border border-border/80 p-6 text-center">
        <CreditCard className="h-8 w-8 mx-auto text-muted-foreground/60 mb-2" />
        <h2 className="text-sm font-semibold text-foreground">No payroll profile</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Your account is not linked to an employee record, so there are no payroll entries to show.
        </p>
      </Card>
    );
  }

  const { employee, payout, records, page } = overview;
  const payoutStatus =
    payout?.isPaid === true ? "Paid" : payout?.isPaid === false ? "Unpaid" : NOT_CONFIGURED;

  return (
    <div className="w-full space-y-6">
      <Card className="rounded-2xl border border-border/80">
        <CardHeader>
          <CardTitle className="text-base">My Payroll</CardTitle>
          <p className="text-xs text-muted-foreground">
            {employee.employeeName} · {employee.employeeCode} · {employee.department} ·{" "}
            {employee.designation}
          </p>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-muted-foreground">Payout status</dt>
              <dd className="font-medium text-foreground">{payoutStatus}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Configured amount</dt>
              <dd className="font-mono font-medium text-foreground">
                {formatAmount(payout?.stipendAmount ?? null)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground flex items-center gap-1">
                <Building className="h-3 w-3" /> Bank
              </dt>
              <dd className="font-medium text-foreground">{payout?.bankName ?? NOT_CONFIGURED}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Account number</dt>
              <dd className="font-mono font-medium text-foreground">
                {payout?.accountNumberMasked ?? NOT_CONFIGURED}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">IFSC</dt>
              <dd className="font-mono font-medium text-foreground">
                {payout?.ifscCode ?? NOT_CONFIGURED}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">PAN</dt>
              <dd className="font-mono font-medium text-foreground">
                {payout?.panMasked ?? NOT_CONFIGURED}
              </dd>
            </div>
          </dl>
          <p className="text-[11px] text-muted-foreground mt-4">
            Contact HR to correct your payout details. Payslips are not available yet (pending OD-008).
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-border/80 overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm">Payroll records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {records.length === 0 ? (
            <p className="p-6 text-xs text-muted-foreground text-center">
              No payroll records have been recorded for you yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead>
                <tr className="border-b border-border/80 bg-muted/40 text-muted-foreground">
                  <th scope="col" className="py-2.5 px-4">Cycle</th>
                  <th scope="col" className="py-2.5 px-4">Period</th>
                  <th scope="col" className="py-2.5 px-4">Status</th>
                  <th scope="col" className="py-2.5 px-4">Reference</th>
                  <th scope="col" className="py-2.5 px-4">Disbursed on</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {records.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 px-4 font-mono">{r.payrollPeriodCode}</td>
                    <td className="py-2.5 px-4">
                      {formatDate(r.periodStartDate)} – {formatDate(r.periodEndDate)}
                    </td>
                    <td className="py-2.5 px-4">
                      <Badge variant="outline">{r.status}</Badge>
                    </td>
                    <td className="py-2.5 px-4 font-mono">{r.disbursementReference ?? "—"}</td>
                    <td className="py-2.5 px-4">{formatDate(r.disbursedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </CardContent>
      </Card>

      <PaginationNav
        page={page.page}
        pageCount={page.pageCount}
        total={page.total}
        hrefFor={(target) => (target > 1 ? `${basePath}?page=${target}` : basePath)}
        label="Payroll record pages"
        itemLabel="records"
      />
    </div>
  );
}
