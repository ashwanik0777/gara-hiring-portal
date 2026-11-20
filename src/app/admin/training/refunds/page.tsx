import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { ForbiddenError } from "@/lib/errors";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listRefundsForStaff, type StaffRefundRow } from "@/features/training/services/refund-service";
import { RefundDecision } from "@/features/training/components/refund-decision";
import { formatInr } from "@/features/training/money";
import { formatBatchDayTime } from "@/features/training/components/batch-dates";
import { ExportLinks } from "@/features/exports/export-links";

export const instant = false;

export const metadata = { title: "Training Refunds", robots: { index: false, follow: false } };

type BadgeVariant = "default" | "secondary" | "success" | "warning" | "destructive" | "outline";

const STATUS: Record<StaffRefundRow["status"], { label: string; variant: BadgeVariant }> = {
  REQUESTED: { label: "Requested", variant: "warning" },
  APPROVED: { label: "Approved · with the bank", variant: "default" },
  PROCESSED: { label: "Refunded", variant: "success" },
  REJECTED: { label: "Rejected", variant: "outline" },
  FAILED: { label: "Failed at the bank", variant: "destructive" },
};

function RefundRow({ refund }: { refund: StaffRefundRow }) {
  const status = STATUS[refund.status];
  const { enrollment } = refund;
  return (
    <li className="grid grid-cols-1 gap-4 py-4 lg:grid-cols-12">
      <div className="space-y-1 lg:col-span-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{enrollment.user.name}</span>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {enrollment.user.email} · {enrollment.batch.program.title} · {enrollment.batch.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatInr(refund.amountPaise)} · receipt {enrollment.receiptNo ?? "—"} · requested {formatBatchDayTime(refund.requestedAt)}
          {refund.razorpayRefundId ? ` · Razorpay ${refund.razorpayRefundId}` : ""}
        </p>
        <p className="whitespace-pre-line text-sm text-foreground">“{refund.reason}”</p>
        {refund.decisionNote && <p className="text-xs text-muted-foreground">Note: {refund.decisionNote}</p>}
      </div>
      <div className="lg:col-span-5">
        {refund.status === "REQUESTED" ? (
          <RefundDecision refundId={refund.id} amountLabel={formatInr(refund.amountPaise)} />
        ) : (
          <p className="text-xs text-muted-foreground">{refund.decidedAt ? `Decided ${formatBatchDayTime(refund.decidedAt)}` : ""}</p>
        )}
      </div>
    </li>
  );
}

export default async function AdminTrainingRefundsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/admin/training/refunds");

  let refunds: StaffRefundRow[];
  try {
    refunds = await listRefundsForStaff(user);
  } catch (error) {
    if (error instanceof ForbiddenError) return <UnauthorizedState message="Only administrators can decide training refunds." />;
    throw error;
  }
  const open = refunds.filter((refund) => refund.status === "REQUESTED");
  const decided = refunds.filter((refund) => refund.status !== "REQUESTED");

  return (
    <div className="w-full space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Training Refunds</h2>
        <p className="text-sm text-muted-foreground">
          Students ask for a refund from their training page while the refund window is open. Approving sends the amount
          paid minus Razorpay&apos;s charges (its fee including GST, read from Razorpay at approval) back through Razorpay;
          rejecting needs a note, which the student sees.
        </p>
        <div className="mt-3">
          <ExportLinks items={[{ dataset: "training-refunds", label: "Refunds CSV" }]} />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Waiting for a decision ({open.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {open.length === 0 ? (
            <p className="text-sm text-muted-foreground">No refund requests are waiting.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {open.map((refund) => (
                <RefundRow key={refund.id} refund={refund} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {decided.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Decided ({decided.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/60">
              {decided.map((refund) => (
                <RefundRow key={refund.id} refund={refund} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
