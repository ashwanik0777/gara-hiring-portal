import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AmbassadorStatus } from "@prisma/client";
import { Award, CalendarDays, ClipboardCheck, Clock, GraduationCap, Mail, Phone, UserCheck, Users, Wallet } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { CERTIFICATE_SIGNATORIES } from "@/config/site";
import { businessDateKey } from "@/lib/time/business-time";
import {
  countAmbassadorsByStatus,
  listAmbassadorsForStaff,
  type StaffAmbassadorRow,
} from "@/features/ambassadors/services/ambassador-service";
import { countCommissionsToReview } from "@/features/ambassadors/services/commission-service";
import { AmbassadorCertificateForm, AmbassadorDecisionForm } from "@/features/ambassadors/components/ambassador-forms";
import { FilterChipLink } from "@/features/employees/components/filter-chip-link";
import { formatInr } from "@/features/training/money";
import { formatBatchDay } from "@/features/training/components/batch-dates";
import { ExportLinks } from "@/features/exports/export-links";

export const instant = false;

export const metadata = { title: "Campus Ambassadors", robots: { index: false, follow: false } };

const BASE = "/admin/campus-ambassadors";
const FILTERS = ["PENDING", "APPROVED", "DEACTIVATED", "REJECTED"] as const satisfies readonly AmbassadorStatus[];
const STATUS_META: Record<AmbassadorStatus, { label: string; filter: string; variant: "warning" | "success" | "outline" | "destructive" }> = {
  PENDING: { label: "Pending", filter: "Pending", variant: "warning" },
  APPROVED: { label: "Active", filter: "Active", variant: "success" },
  DEACTIVATED: { label: "Deactivated", filter: "Deactivated", variant: "destructive" },
  REJECTED: { label: "Rejected", filter: "Rejected", variant: "outline" },
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function AmbassadorCard({ ambassador, now }: { ambassador: StaffAmbassadorRow; now: Date }) {
  const { stats } = ambassador;
  const meta = STATUS_META[ambassador.status];
  const active = ambassador.status === "APPROVED" || ambassador.status === "DEACTIVATED";
  return (
    <li className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-4 border-b border-border/60 p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
            {initials(ambassador.user.name)}
          </span>
          <div className="min-w-0 space-y-1.5">
            <p className="flex flex-wrap items-center gap-2 text-base font-semibold text-foreground">
              {ambassador.user.name}
              <Badge variant={meta.variant} className="text-[10px]">
                {meta.label}
              </Badge>
              {ambassador.role && (
                <Badge variant="secondary" className="text-[10px]">
                  {ambassador.role === "LEAD" ? "Lead" : "Associate"}
                </Badge>
              )}
              {ambassador.trialEndsAt && ambassador.trialEndsAt > now && (
                <Badge variant="outline" className="text-[10px]">
                  Trial
                </Badge>
              )}
              {ambassador.duplicateFlag && (
                <Badge variant="destructive" className="text-[10px]">
                  {ambassador.duplicateFlag}
                </Badge>
              )}
            </p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <li className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                {ambassador.user.email}
              </li>
              <li className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                {ambassador.phone}
              </li>
              <li className="inline-flex items-center gap-1.5">
                <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                {ambassador.college?.name ?? "No college"}
                {ambassador.branch ? ` · ${ambassador.branch}` : ""}
                {ambassador.yearOfStudy ? ` · year ${ambassador.yearOfStudy}` : ""}
              </li>
              <li className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                Applied {formatBatchDay(ambassador.createdAt)}
              </li>
              {active && (
                <li className="inline-flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                  {ambassador.upiIdMasked ?? "No UPI ID"}
                </li>
              )}
            </ul>
          </div>
        </div>
        {ambassador.referralCode && (
          <span className="self-start rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1 font-mono text-xs font-semibold text-primary">{ambassador.referralCode}</span>
        )}
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {active && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7" aria-label="Performance">
            <Metric label="Link clicks" value={stats.clicks} />
            <Metric label="Sign-ups" value={stats.signups} />
            <Metric label="Applications" value={stats.applications} />
            <Metric label="Paid enrollments" value={stats.paidEnrollments} />
            <Metric label="Under review" value={formatInr(stats.earnings.pending)} />
            <Metric label="Approved" value={formatInr(stats.earnings.approved)} />
            <Metric label="Paid" value={formatInr(stats.earnings.paid)} />
          </div>
        )}

        <details className="group rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm">
          <summary className="cursor-pointer list-none text-xs font-semibold text-primary [&::-webkit-details-marker]:hidden">Application</summary>
          <dl className="mt-3 space-y-2 text-xs">
            <div>
              <dt className="font-medium text-foreground">Why</dt>
              <dd className="whitespace-pre-line text-muted-foreground">{ambassador.motivation}</dd>
            </div>
            {ambassador.socialReach && (
              <div>
                <dt className="font-medium text-foreground">Reach</dt>
                <dd className="whitespace-pre-line text-muted-foreground">{ambassador.socialReach}</dd>
              </div>
            )}
            {ambassador.pastExperience && (
              <div>
                <dt className="font-medium text-foreground">Experience</dt>
                <dd className="whitespace-pre-line text-muted-foreground">{ambassador.pastExperience}</dd>
              </div>
            )}
            {ambassador.decisionNote && (
              <div>
                <dt className="font-medium text-foreground">Decision note</dt>
                <dd className="text-muted-foreground">{ambassador.decisionNote}</dd>
              </div>
            )}
          </dl>
        </details>

        <div className="grid grid-cols-1 gap-4 border-t border-border/60 pt-4 xl:grid-cols-2">
          {ambassador.status !== "REJECTED" && <AmbassadorDecisionForm ambassadorId={ambassador.id} status={ambassador.status} />}
          {ambassador.certificate ? (
            <p className="inline-flex flex-wrap items-center gap-2 self-start text-xs text-muted-foreground">
              <Award className="h-4 w-4 text-primary" aria-hidden="true" />
              Certificate {ambassador.certificate.verificationCode} ({ambassador.certificate.status.toLowerCase()})
              <a href={`/api/certificates/${ambassador.certificate.id}/download`} className="font-medium text-primary hover:underline">
                Download
              </a>
            </p>
          ) : ambassador.approvedAt ? (
            <details className="group self-start">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-primary [&::-webkit-details-marker]:hidden">
                <Award className="h-3.5 w-3.5" aria-hidden="true" />
                Issue ambassador certificate
              </summary>
              <div className="mt-3">
                <AmbassadorCertificateForm
                  ambassadorId={ambassador.id}
                  defaults={{ name: CERTIFICATE_SIGNATORIES.primary.name ?? "", title: CERTIFICATE_SIGNATORIES.primary.title, periodEnd: businessDateKey(now) }}
                />
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export default async function AdminAmbassadorsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=${BASE}`);
  const requested = (await searchParams).status?.toUpperCase();
  const filter = (FILTERS as readonly string[]).includes(requested ?? "") ? (requested as AmbassadorStatus) : null;
  await connection();
  const now = new Date();

  let ambassadors: StaffAmbassadorRow[];
  let counts: Record<AmbassadorStatus, number>;
  let toReview: number;
  try {
    [ambassadors, counts, toReview] = await Promise.all([
      listAmbassadorsForStaff(user, { status: filter }, now),
      countAmbassadorsByStatus(user),
      countCommissionsToReview(user, now),
    ]);
  } catch (error) {
    if (error instanceof ForbiddenError) return <UnauthorizedState message="Only administrators can manage Campus Ambassadors." />;
    throw error;
  }
  const total = counts.PENDING + counts.APPROVED + counts.REJECTED + counts.DEACTIVATED;
  const href = (status: AmbassadorStatus | null) => (status ? `${BASE}?status=${status.toLowerCase()}` : BASE);

  return (
    <div className="w-full space-y-6">
      <StatGrid columns={4} label="Ambassador summary">
        <StatCard label="Ambassadors" value={total} icon={Users} tone="blue" href={href(null)} />
        <StatCard label="Pending Applications" value={counts.PENDING} icon={Clock} tone="amber" href={href("PENDING")} />
        <StatCard label="Active" value={counts.APPROVED} icon={UserCheck} tone="emerald" href={href("APPROVED")} />
        <StatCard label="Commissions to Review" value={toReview} icon={ClipboardCheck} tone="violet" href="/admin/campus-ambassadors/payouts" />
      </StatGrid>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Filter ambassadors" className="flex flex-wrap gap-2">
          <FilterChipLink href={href(null)} active={filter === null} label="All" count={total} />
          {FILTERS.filter((status) => counts[status] > 0 || status === filter).map((status) => (
            <FilterChipLink key={status} href={href(status)} active={filter === status} label={STATUS_META[status].filter} count={counts[status]} />
          ))}
        </nav>
        <ExportLinks items={[{ dataset: "ambassadors", label: "Ambassadors CSV" }]} />
      </div>

      {ambassadors.length === 0 ? (
        <EmptyState
          title={filter ? `No ${STATUS_META[filter].filter.toLowerCase()} ambassadors` : "No ambassador applications yet"}
          action={
            filter ? (
              <Link href={BASE} className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">
                Show all
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4" aria-label="Ambassadors">
          {ambassadors.map((ambassador) => (
            <AmbassadorCard key={ambassador.id} ambassador={ambassador} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}
