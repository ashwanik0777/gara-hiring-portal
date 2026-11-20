import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AmbassadorStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CERTIFICATE_SIGNATORIES } from "@/config/site";
import { businessDateKey } from "@/lib/time/business-time";
import { listAmbassadorsForStaff, type StaffAmbassadorRow } from "@/features/ambassadors/services/ambassador-service";
import { AmbassadorCertificateForm, AmbassadorDecisionForm } from "@/features/ambassadors/components/ambassador-forms";
import { formatInr } from "@/features/training/money";
import { formatBatchDay } from "@/features/training/components/batch-dates";
import { ExportLinks } from "@/features/exports/export-links";

export const instant = false;

export const metadata = { title: "Campus Ambassadors", robots: { index: false, follow: false } };

const FILTERS = ["ALL", "PENDING", "APPROVED", "REJECTED", "DEACTIVATED"] as const;
const STATUS_VARIANT: Record<string, "warning" | "success" | "outline" | "destructive"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "outline",
  DEACTIVATED: "destructive",
};

function Row({ ambassador, now }: { ambassador: StaffAmbassadorRow; now: Date }) {
  const { stats } = ambassador;
  return (
    <li className="grid grid-cols-1 gap-4 py-5 xl:grid-cols-12">
      <div className="space-y-1 xl:col-span-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{ambassador.user.name}</span>
          <Badge variant={STATUS_VARIANT[ambassador.status]}>{ambassador.status.toLowerCase()}</Badge>
          {ambassador.role && <Badge variant="secondary">{ambassador.role === "LEAD" ? "Lead" : "Associate"}</Badge>}
          {ambassador.trialEndsAt && ambassador.trialEndsAt > now && <Badge variant="outline">trial</Badge>}
          {ambassador.duplicateFlag && <Badge variant="destructive">{ambassador.duplicateFlag}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">
          {ambassador.user.email} · {ambassador.phone} · {ambassador.college?.name ?? "No college"}
          {ambassador.branch ? ` · ${ambassador.branch}` : ""}
          {ambassador.yearOfStudy ? ` · year ${ambassador.yearOfStudy}` : ""} · applied {formatBatchDay(ambassador.createdAt)}
        </p>
        {ambassador.referralCode && <p className="font-mono text-xs">{ambassador.referralCode}</p>}
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-primary">Application</summary>
          <p className="mt-1 whitespace-pre-line">Why: {ambassador.motivation}</p>
          {ambassador.socialReach && <p className="whitespace-pre-line">Reach: {ambassador.socialReach}</p>}
          {ambassador.pastExperience && <p className="whitespace-pre-line">Experience: {ambassador.pastExperience}</p>}
        </details>
        {ambassador.decisionNote && <p className="text-xs text-muted-foreground">Note: {ambassador.decisionNote}</p>}
        {ambassador.status !== "PENDING" && ambassador.status !== "REJECTED" && (
          <p className="text-xs">
            {stats.clicks} clicks · {stats.signups} sign-ups · {stats.applications} applications · {stats.paidEnrollments} paid · earned{" "}
            {formatInr(stats.earnings.pending + stats.earnings.payable + stats.earnings.paid)} (paid {formatInr(stats.earnings.paid)}) · UPI{" "}
            {ambassador.upiIdMasked ?? "not added"}
          </p>
        )}
      </div>
      <div className="space-y-3 xl:col-span-6">
        {ambassador.status !== "REJECTED" && <AmbassadorDecisionForm ambassadorId={ambassador.id} status={ambassador.status} />}
        {ambassador.certificate ? (
          <p className="text-xs">
            Certificate {ambassador.certificate.verificationCode} ({ambassador.certificate.status.toLowerCase()}) ·{" "}
            <a href={`/api/certificates/${ambassador.certificate.id}/download`} className="font-medium text-primary hover:underline">
              Download
            </a>
          </p>
        ) : ambassador.approvedAt ? (
          <details>
            <summary className="cursor-pointer text-xs font-medium text-primary">Issue ambassador certificate</summary>
            <div className="mt-2">
              <AmbassadorCertificateForm
                ambassadorId={ambassador.id}
                defaults={{ name: CERTIFICATE_SIGNATORIES.primary.name ?? "", title: CERTIFICATE_SIGNATORIES.primary.title, periodEnd: businessDateKey(now) }}
              />
            </div>
          </details>
        ) : null}
      </div>
    </li>
  );
}

export default async function AdminAmbassadorsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/admin/campus-ambassadors");
  const requested = (await searchParams).status?.toUpperCase();
  const filter = FILTERS.includes(requested as (typeof FILTERS)[number]) ? (requested as (typeof FILTERS)[number]) : "ALL";
  await connection();
  const now = new Date();

  let ambassadors: StaffAmbassadorRow[];
  try {
    ambassadors = await listAmbassadorsForStaff(user, { status: filter === "ALL" ? null : (filter as AmbassadorStatus) }, now);
  } catch (error) {
    if (error instanceof ForbiddenError) return <UnauthorizedState message="Only administrators can manage Campus Ambassadors." />;
    throw error;
  }

  return (
    <div className="w-full space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Campus Ambassadors</h2>
        <p className="text-sm text-muted-foreground">Applications, approvals (one Lead per college), performance and certificates.</p>
        <div className="mt-3">
          <ExportLinks items={[{ dataset: "ambassadors", label: "Ambassadors CSV" }]} />
        </div>
      </div>
      <nav aria-label="Filter ambassadors" className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Link
            key={item}
            href={item === "ALL" ? "/admin/campus-ambassadors" : `/admin/campus-ambassadors?status=${item.toLowerCase()}`}
            aria-current={item === filter ? "page" : undefined}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium ${item === filter ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
          >
            {item === "ALL" ? "All" : item.charAt(0) + item.slice(1).toLowerCase()}
          </Link>
        ))}
      </nav>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ambassadors ({ambassadors.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {ambassadors.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody here yet.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {ambassadors.map((ambassador) => (
                <Row key={ambassador.id} ambassador={ambassador} now={now} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
