import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { Award, Download } from "lucide-react";
import { requirePortalCapability } from "@/features/lifecycle/services/lifecycle-service";
import { linkButtonClass } from "@/features/lifecycle/components/self-service-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { CAMPUS_AMBASSADOR_KIT, CAMPUS_AMBASSADOR_POLICY } from "@/config/site";
import { getMyAmbassador, referralLink, type MyAmbassador } from "@/features/ambassadors/services/ambassador-service";
import { listMyCommissions } from "@/features/ambassadors/services/commission-service";
import { AmbassadorApplyForm, CopyButton, UpiForm } from "@/features/ambassadors/components/ambassador-forms";
import { formatInr } from "@/features/training/money";
import { formatBatchDay } from "@/features/training/components/batch-dates";

export const instant = false;

export const metadata: Metadata = { title: "Campus Ambassador", robots: { index: false, follow: false } };

const BUCKET_LABELS = {
  pending: "Waiting",
  review: "Under review",
  approved: "Approved",
  declined: "Not approved",
  processing: "Being paid",
  paid: "Paid",
  reversed: "Reversed",
} as const;

function Leaderboard({ title, rows, myId }: { title: string; rows: NonNullable<MyAmbassador["leaderboards"]>["overall"]; myId: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No paid enrollments yet.</p>
      ) : (
        <ol className="space-y-1 text-sm">
          {rows.map((row) => (
            <li key={row.ambassadorId} className={`flex justify-between gap-2 ${row.ambassadorId === myId ? "font-semibold text-primary" : ""}`}>
              <span>
                {row.rank}. {row.name}
                {row.college ? <span className="text-xs text-muted-foreground"> · {row.college}</span> : null}
              </span>
              <span>{row.paidEnrollments}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

async function Dashboard({ ambassador, now }: { ambassador: MyAmbassador; now: Date }) {
  const active = ambassador.status === "APPROVED";
  const link = ambassador.referralCode ? referralLink(ambassador.referralCode) : null;
  const commissions = await listMyCommissions(ambassador.id, now);
  const stats = ambassador.stats!;
  const whatsapp = CAMPUS_AMBASSADOR_KIT.whatsappTemplate && link ? CAMPUS_AMBASSADOR_KIT.whatsappTemplate.replaceAll("{link}", link) : null;
  return (
    <div className="space-y-6">
      {!active && (
        <p role="status" className="rounded-md border border-border bg-muted/40 p-3 text-sm">
          Your ambassador role is deactivated{ambassador.decisionNote ? `: ${ambassador.decisionNote}` : "."} Your referral code no longer
          works; earned commissions stay below.
        </p>
      )}
      {active && link && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your referral link</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="space-y-3 md:col-span-2">
              <p className="break-all font-mono text-sm">{link}</p>
              <div className="flex flex-wrap gap-2">
                <CopyButton value={link} label="Copy link" />
                <CopyButton value={ambassador.referralCode!} label="Copy code" />
                {whatsapp && <CopyButton value={whatsapp} label="Copy WhatsApp message" />}
              </div>
              <p className="text-xs text-muted-foreground">
                Students who open the link are remembered for {CAMPUS_AMBASSADOR_POLICY.attributionDays} days (last click wins). Your code
                gives them {CAMPUS_AMBASSADOR_POLICY.studentDiscountPercent}% off Industrial Training; you earn{" "}
                {formatInr(CAMPUS_AMBASSADOR_POLICY.commissionPaise)} per paid enrollment once its refund window closes.
              </p>
              <p className="text-xs text-muted-foreground">
                Role: {ambassador.role === "LEAD" ? "Lead" : "Associate"}
                {ambassador.college ? ` · ${ambassador.college.name}` : ""}
                {ambassador.trialEndsAt && ambassador.trialEndsAt > now ? ` · trial until ${formatBatchDay(ambassador.trialEndsAt)}` : ""}
              </p>
            </div>
            <div className="flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- private, per-user SVG from an authenticated route */}
              <img src="/api/ambassador/qr" alt={`QR code for ${link}`} width={160} height={160} className="rounded-md border border-border bg-white p-1" />
              <a href="/api/ambassador/qr?download=1" className={linkButtonClass("outline", "sm")}>
                <Download className="h-3.5 w-3.5" aria-hidden="true" /> Download QR
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      <StatGrid columns={4} label="Ambassador performance">
        <StatCard label="Link clicks" value={stats.clicks} tone="blue" />
        <StatCard label="Sign-ups" value={stats.signups} tone="violet" />
        <StatCard label="Applications" value={stats.applications} tone="amber" />
        <StatCard label="Paid enrollments" value={stats.paidEnrollments} tone="emerald" />
      </StatGrid>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Earnings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Under review</dt>
                <dd className="font-semibold">{formatInr(stats.earnings.pending)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Approved</dt>
                <dd className="font-semibold">{formatInr(stats.earnings.approved)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Paid</dt>
                <dd className="font-semibold">{formatInr(stats.earnings.paid)}</dd>
              </div>
            </dl>
            {commissions.length > 0 && (
              <ul className="divide-y divide-border/60 text-sm">
                {commissions.slice(0, 20).map((commission) => (
                  <li key={commission.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      {commission.enrollment.batch.program.title} · {commission.enrollment.batch.name}
                      <span className="block text-xs text-muted-foreground">
                        {commission.bucket === "pending" ? `Review after ${formatBatchDay(commission.payableAt)}` : `Recorded ${formatBatchDay(commission.createdAt)}`}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {formatInr(commission.amountPaise)} <Badge variant={commission.bucket === "reversed" || commission.bucket === "declined" ? "destructive" : commission.bucket === "paid" || commission.bucket === "approved" ? "success" : "outline"}>{BUCKET_LABELS[commission.bucket]}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {active && <UpiForm masked={ambassador.upiIdMasked} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Leaderboard (paid enrollments)</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Leaderboard title="Overall" rows={ambassador.leaderboards!.overall} myId={ambassador.id} />
            <Leaderboard title={ambassador.college?.name ?? "Your college"} rows={ambassador.leaderboards!.college} myId={ambassador.id} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Payouts</CardTitle>
        </CardHeader>
        <CardContent>
          {ambassador.payouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payout yet.</p>
          ) : (
            <ul className="divide-y divide-border/60 text-sm">
              {ambassador.payouts.map((payout) => (
                <li key={payout.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    {formatBatchDay(payout.paidAt ?? payout.createdAt)} · {formatInr(payout.netPaise)}
                    {payout.tdsPaise > 0 ? <span className="text-xs text-muted-foreground"> (TDS {formatInr(payout.tdsPaise)})</span> : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {payout.status === "PAID" ? `Paid${payout.utr ? ` · UTR ${payout.utr}` : ""}` : payout.status === "FAILED" ? "Failed, will be retried" : "Processing"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {(CAMPUS_AMBASSADOR_KIT.pitchScript || CAMPUS_AMBASSADOR_KIT.posters.length > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Marketing kit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {CAMPUS_AMBASSADOR_KIT.pitchScript && <p className="whitespace-pre-line text-muted-foreground">{CAMPUS_AMBASSADOR_KIT.pitchScript}</p>}
            {CAMPUS_AMBASSADOR_KIT.posters.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {CAMPUS_AMBASSADOR_KIT.posters.map((poster) => (
                  <li key={poster.href}>
                    <a href={poster.href} download className={linkButtonClass("outline", "sm")}>
                      <Download className="h-3.5 w-3.5" aria-hidden="true" /> {poster.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {ambassador.certificate?.status === "ACTIVE" && (
        <a href={`/api/certificates/${ambassador.certificate.id}/download`} className={linkButtonClass("primary", "md")}>
          <Award className="h-4 w-4" aria-hidden="true" /> Download ambassador certificate
        </a>
      )}
    </div>
  );
}

export default async function AmbassadorPage() {
  const { user } = await requirePortalCapability("ambassador", { callbackPath: "/candidate/ambassador" });
  await connection();
  const now = new Date();
  const ambassador = await getMyAmbassador(user.id, now);

  return (
    <div className="w-full space-y-6">
      <header className="space-y-2">
        <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Campus Ambassador</h2>
        <p className="text-sm text-muted-foreground">
          Represent GARA at your college.{" "}
          <Link href="/campus-ambassador" className="font-medium text-primary hover:underline underline-offset-4">
            How the programme works
          </Link>
        </p>
      </header>
      {!ambassador ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Apply</CardTitle>
          </CardHeader>
          <CardContent>
            <AmbassadorApplyForm />
          </CardContent>
        </Card>
      ) : ambassador.status === "PENDING" ? (
        <p role="status" className="rounded-md border border-border bg-muted/40 p-4 text-sm">
          Your application from {formatBatchDay(ambassador.createdAt)} is being reviewed. You will get an email with the decision.
        </p>
      ) : ambassador.status === "REJECTED" ? (
        <p role="status" className="rounded-md border border-border bg-muted/40 p-4 text-sm">
          Your application was not approved{ambassador.decisionNote ? `: ${ambassador.decisionNote}` : "."}
        </p>
      ) : (
        <Dashboard ambassador={ambassador} now={now} />
      )}
    </div>
  );
}
