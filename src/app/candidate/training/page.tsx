import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { Award, BookOpen, Download, GraduationCap } from "lucide-react";
import { requirePortalCapability } from "@/features/lifecycle/services/lifecycle-service";
import { linkButtonClass } from "@/features/lifecycle/components/self-service-ui";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { COMPANY, TRAINING_POLICY } from "@/config/site";
import {
  listMyTrainingEnrollments,
  listTransferTargets,
  type MyTrainingEnrollment,
  type TransferTarget,
} from "@/features/training/services/enrollment-service";
import { canTransfer, isRefundWindowOpen, refundWindowClosesAt } from "@/features/training/policy";
import { formatInr } from "@/features/training/money";
import { formatBatchDay, formatBatchDayTime } from "@/features/training/components/batch-dates";
import { RefundRequestForm, TransferForm } from "@/features/training/components/enrollment-actions";
import { ToastOnMount } from "@/components/ui/toast-on-mount";

export const instant = false;

export const metadata: Metadata = { title: "My Training", robots: { index: false, follow: false } };

type BadgeVariant = "default" | "secondary" | "success" | "warning" | "destructive" | "outline";

const STATUS_LABELS: Record<MyTrainingEnrollment["status"], { label: string; variant: BadgeVariant }> = {
  PENDING_PAYMENT: { label: "Payment pending", variant: "outline" },
  ACTIVE: { label: "Enrolled", variant: "success" },
  REFUND_REQUESTED: { label: "Refund requested", variant: "warning" },
  REFUNDED: { label: "Refunded", variant: "secondary" },
  COMPLETED: { label: "Completed", variant: "success" },
  FAILED: { label: "Not passed", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "outline" },
};

function RefundNote({ enrollment }: { enrollment: MyTrainingEnrollment }) {
  const refund = enrollment.refunds[0];
  if (!refund) return null;
  switch (refund.status) {
    case "REQUESTED":
      return (
        <p className="text-sm text-muted-foreground">
          Your refund request is with an administrator: about {formatInr(refund.amountPaise)} (the amount paid minus Razorpay&apos;s
          fee and GST; the exact amount is settled when it is approved).
        </p>
      );
    case "APPROVED":
      return (
        <p className="text-sm text-muted-foreground">
          Your refund of {formatInr(refund.amountPaise)} was approved and sent through Razorpay. Banks usually take 5–7 working
          days to show it in your account.
        </p>
      );
    case "PROCESSED":
      return <p className="text-sm text-muted-foreground">{formatInr(refund.amountPaise)} was refunded to your original payment method.</p>;
    case "FAILED":
      return (
        <p className="text-sm text-muted-foreground">
          The refund could not be completed by the bank. We will contact you; you can also write to {COMPANY.contactEmail}.
        </p>
      );
    case "REJECTED":
      return (
        <p className="text-sm text-muted-foreground">
          Your refund request was not approved{refund.decisionNote ? `: ${refund.decisionNote}` : "."}
        </p>
      );
    default:
      return null;
  }
}

function EnrollmentCard({ enrollment, now, targets }: { enrollment: MyTrainingEnrollment; now: Date; targets: TransferTarget[] }) {
  const { batch } = enrollment;
  const status = STATUS_LABELS[enrollment.status];
  const active = enrollment.status === "ACTIVE";
  const reattempt = enrollment.reattemptOfId !== null;
  // A free re-attempt has nothing to refund and cannot be transferred.
  const refundOpen = active && !reattempt && isRefundWindowOpen(batch, now);
  const transferOpen = active && !reattempt && canTransfer(enrollment, batch, now);
  const hasLearningArea = ["ACTIVE", "REFUND_REQUESTED", "COMPLETED", "FAILED"].includes(enrollment.status);

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <Link href={`/training/${batch.program.slug}`} className="text-base font-semibold text-foreground hover:underline underline-offset-4">
              {batch.program.title}
            </Link>
            <p className="text-xs text-muted-foreground">
              {batch.name} · starts {formatBatchDay(batch.startDate)}
              {batch.firstClassAt ? ` · first live class ${formatBatchDayTime(batch.firstClassAt)}` : ""}
            </p>
          </div>
          <span className="flex flex-wrap gap-1">
            {reattempt && <Badge variant="secondary">Free re-attempt</Badge>}
            <Badge variant={status.variant}>{status.label}</Badge>
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Amount paid</dt>
            <dd className="font-medium text-foreground">{reattempt ? "Free re-attempt" : formatInr(enrollment.amountPaidPaise)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Receipt number</dt>
            <dd className="font-mono text-xs text-foreground">{enrollment.receiptNo ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Paid on</dt>
            <dd className="text-foreground">{enrollment.paidAt ? formatBatchDay(enrollment.paidAt) : "—"}</dd>
          </div>
        </dl>

        <RefundNote enrollment={enrollment} />

        <div className="flex flex-wrap items-start gap-4 border-t border-border/60 pt-4">
          {hasLearningArea && (
            <Link href={`/candidate/training/${enrollment.id}`} className={linkButtonClass("primary", "md")}>
              <GraduationCap className="h-4 w-4" aria-hidden="true" /> Open learning area
            </Link>
          )}
          {enrollment.certificate?.status === "ACTIVE" && (
            <a href={`/api/certificates/${enrollment.certificate.id}/download`} className={linkButtonClass("outline", "md")}>
              <Award className="h-4 w-4" aria-hidden="true" /> Certificate
            </a>
          )}
          {enrollment.receiptNo && (
            <a href={`/api/training/enrollments/${enrollment.id}/receipt`} className={linkButtonClass("outline", "md")}>
              <Download className="h-4 w-4" aria-hidden="true" /> Download receipt
            </a>
          )}
          {refundOpen && (
            <RefundRequestForm
              enrollmentId={enrollment.id}
              closesAtLabel={formatBatchDayTime(refundWindowClosesAt(batch))}
              amountLabel={formatInr(enrollment.amountPaidPaise)}
            />
          )}
          {transferOpen && (
            <div className="w-full">
              <TransferForm
                enrollmentId={enrollment.id}
                targets={targets.map((target) => ({
                  id: target.id,
                  label: `${target.name} · starts ${formatBatchDay(target.startDate)} · ${target.seatsLeft} seat${target.seatsLeft === 1 ? "" : "s"} left`,
                }))}
              />
            </div>
          )}
          {active && !reattempt && !refundOpen && !transferOpen && (
            <p className="text-xs text-muted-foreground">
              The refund window has closed and the free transfer has been used.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function MyTrainingPage({ searchParams }: { searchParams: Promise<{ paid?: string | string[] }> }) {
  const { user } = await requirePortalCapability("training", { callbackPath: "/candidate/training" });
  const { paid } = await searchParams;
  await connection();
  const now = new Date();

  const enrollments = await listMyTrainingEnrollments(user.id);
  const targetsByEnrollment = new Map<string, TransferTarget[]>();
  await Promise.all(
    enrollments
      .filter((enrollment) => enrollment.status === "ACTIVE" && !enrollment.reattemptOfId && canTransfer(enrollment, enrollment.batch, now))
      .map(async (enrollment) => {
        targetsByEnrollment.set(enrollment.id, await listTransferTargets(enrollment.batch.programId, enrollment.batch.id, now));
      })
  );

  return (
    <div className="w-full space-y-6">
      <header className="space-y-2">
        <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">My Training</h2>
      </header>

      {paid === "1" && (
        <ToastOnMount message="Payment received. Your seat is confirmed and your receipt is ready below." clearParam="paid" />
      )}

      {enrollments.length === 0 ? (
        <EmptyState
          title="No training enrollments yet"
          description="Browse the Industrial Training programmes and enrol in a batch. Your receipts will appear here."
          icon={<BookOpen className="h-6 w-6 text-primary" />}
          action={
            <Link href="/training" className={linkButtonClass("primary")}>
              <BookOpen className="h-4 w-4" aria-hidden="true" /> View programmes
            </Link>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4">
          {enrollments.map((enrollment) => (
            <li key={enrollment.id}>
              <EnrollmentCard enrollment={enrollment} now={now} targets={targetsByEnrollment.get(enrollment.id) ?? []} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
