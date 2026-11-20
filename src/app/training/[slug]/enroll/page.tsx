import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/navigation/navbar";
import { PAGE_GUTTER } from "@/components/layout/page-gutter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/guards";
import { getRazorpayConfig } from "@/infrastructure/payments/razorpay";
import { getPublishedProgramBySlug, isBatchOpenForEnrollment, seatsTakenByBatch } from "@/features/training/services/program-service";
import { TrainingCheckout } from "@/features/training/components/training-checkout";
import { formatInr } from "@/features/training/money";
import { formatBatchDay, formatBatchDayTime } from "@/features/training/components/batch-dates";
import { cookies } from "next/headers";
import { TRAINING_POLICY } from "@/config/site";
import { normalizeReferralCode, REFERRAL_COOKIE } from "@/features/ambassadors/policy";

export const instant = false;

export const metadata = { title: "Enrol", robots: { index: false, follow: false } };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function EnrolPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const batchParam = (await searchParams).batch;
  const batchId = Array.isArray(batchParam) ? batchParam[0] : batchParam;
  if (!batchId || !z.uuid().safeParse(batchId).success) notFound();

  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(`/training/${slug}/enroll?batch=${batchId}`)}`);

  const program = await getPublishedProgramBySlug(slug);
  const batch = program?.batches.find((candidate) => candidate.id === batchId);
  if (!program || !batch) notFound();

  const now = new Date();
  const taken = (await seatsTakenByBatch([batch.id], now)).get(batch.id) ?? 0;
  const seatsLeft = Math.max(0, batch.seats - taken);
  const open = isBatchOpenForEnrollment(batch, now) && seatsLeft > 0;
  const paymentsReady = getRazorpayConfig() !== null;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar user={user} />
      <main className="flex-1 py-10">
        <div className={`${PAGE_GUTTER} space-y-6`}>
          <Link href={`/training/${program.slug}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to the programme
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Enrol: {program.title}</h1>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <Card className="lg:col-span-7">
              <CardHeader>
                <CardTitle className="text-base">Your enrollment</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Batch</dt>
                    <dd className="font-medium">{batch.name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Starts</dt>
                    <dd className="font-medium">{formatBatchDay(batch.startDate)}</dd>
                  </div>
                  {batch.firstClassAt && (
                    <div>
                      <dt className="text-xs text-muted-foreground">First live class</dt>
                      <dd className="font-medium">{formatBatchDayTime(batch.firstClassAt)}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-muted-foreground">Seats left</dt>
                    <dd className="font-medium">{seatsLeft}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Fee</dt>
                    <dd className="text-lg font-bold">{formatInr(program.feePaise)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Included</dt>
                    <dd className="font-medium">Training, mentorship and the digital certificate</dd>
                  </div>
                </dl>
                <p className="mt-6 text-xs text-muted-foreground">
                  Refund before the batch starts or within {TRAINING_POLICY.refundHoursAfterFirstClass} hours after the first
                  live class, minus the payment gateway charges (Razorpay&apos;s fee and GST); after that one free transfer to a
                  later batch. Your Payment Receipt is available in your training
                  dashboard right after payment.
                </p>
              </CardContent>
            </Card>

            <Card className="lg:col-span-5">
              <CardHeader>
                <CardTitle className="text-base">Payment</CardTitle>
              </CardHeader>
              <CardContent>
                {!open ? (
                  <p className="text-sm text-muted-foreground">{seatsLeft === 0 ? "This batch is full." : "Enrollment for this batch has closed."}</p>
                ) : !paymentsReady ? (
                  <p className="text-sm text-muted-foreground">Online payment opens soon. Please check back shortly.</p>
                ) : (
                  <TrainingCheckout
                    batchId={batch.id}
                    feePaise={program.feePaise}
                    defaultReferralCode={normalizeReferralCode((await cookies()).get(REFERRAL_COOKIE)?.value)}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
