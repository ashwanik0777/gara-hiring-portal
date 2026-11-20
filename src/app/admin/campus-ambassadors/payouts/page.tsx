import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listPayouts } from "@/features/ambassadors/services/commission-service";
import { PayoutActions } from "@/features/ambassadors/components/ambassador-forms";
import { formatInr } from "@/features/training/money";
import { formatBatchDay } from "@/features/training/components/batch-dates";
import { ExportLinks } from "@/features/exports/export-links";

export const instant = false;

export const metadata = { title: "Ambassador Payouts", robots: { index: false, follow: false } };

export default async function AmbassadorPayoutsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/admin/campus-ambassadors/payouts");
  await connection();
  const now = new Date();

  let data: Awaited<ReturnType<typeof listPayouts>>;
  try {
    data = await listPayouts(user, now);
  } catch (error) {
    if (error instanceof ForbiddenError) return <UnauthorizedState message="Only administrators can pay ambassadors." />;
    throw error;
  }
  const razorpayXReason = !data.razorpayXReady
    ? "RazorpayX is not configured (RAZORPAYX_ACCOUNT_NUMBER)."
    : data.tdsPercent === null
      ? "The TDS rule is not decided yet (OPEN_DECISIONS #30)."
      : null;

  return (
    <div className="w-full space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Ambassador Payouts</h2>
        <p className="text-sm text-muted-foreground">
          Commissions become payable once the batch&apos;s refund window has closed. Pay through RazorpayX to the ambassador&apos;s UPI ID, or
          record a bank payout made outside with its UTR.
        </p>
        <div className="mt-3">
          <ExportLinks items={[{ dataset: "ambassador-payouts", label: "Payouts CSV" }]} />
        </div>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Payable now ({data.payable.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {data.payable.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing is payable right now.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {data.payable.map((row) => (
                <li key={row.ambassadorId} className="grid grid-cols-1 gap-3 py-4 lg:grid-cols-12">
                  <div className="text-sm lg:col-span-4">
                    <p className="font-medium">{row.ambassador?.user.name ?? "Ambassador"}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.ambassador?.user.email} · {row.ambassador?.college?.name ?? "No college"}
                    </p>
                    <p className="text-xs">
                      {formatInr(row.amountPaise)} for {row.commissions} enrollment{row.commissions === 1 ? "" : "s"} · UPI {row.ambassador?.upiIdMasked ?? "not added"}
                    </p>
                  </div>
                  <div className="lg:col-span-8">
                    <PayoutActions
                      ambassadorId={row.ambassadorId}
                      canUseRazorpayX={!razorpayXReason && Boolean(row.ambassador?.upiIdMasked)}
                      razorpayXReason={razorpayXReason ?? (row.ambassador?.upiIdMasked ? null : "No UPI ID yet.")}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Payout history</CardTitle>
        </CardHeader>
        <CardContent>
          {data.payouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payout yet.</p>
          ) : (
            <ul className="divide-y divide-border/60 text-sm">
              {data.payouts.map((payout) => (
                <li key={payout.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {payout.ambassador.user.name} · {formatInr(payout.netPaise)} (gross {formatInr(payout.grossPaise)}, TDS {formatInr(payout.tdsPaise)}) ·{" "}
                    {payout.method === "MANUAL" ? "bank transfer" : "RazorpayX"} · {formatBatchDay(payout.paidAt ?? payout.createdAt)}
                    {payout.utr ? ` · UTR ${payout.utr}` : ""}
                    {payout.failureReason ? <span className="block text-xs text-destructive">{payout.failureReason}</span> : null}
                  </span>
                  <Badge variant={payout.status === "PAID" ? "success" : payout.status === "FAILED" ? "destructive" : "outline"}>{payout.status.toLowerCase()}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
