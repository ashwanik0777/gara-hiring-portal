import Link from "next/link";
import { redirect } from "next/navigation";
import { CertificateStatus, CertificateType } from "@prisma/client";
import {
  Award,
  BookOpen,
  Briefcase,
  CalendarDays,
  Download,
  ExternalLink,
  FileSearch,
  Megaphone,
  Package,
  Search,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { fieldInputClass, fieldOkBorder } from "@/components/ui/form-field";
import { FilterChipLink } from "@/features/employees/components/filter-chip-link";
import { formatBatchDay } from "@/features/training/components/batch-dates";
import { ExportLinks } from "@/features/exports/export-links";
import {
  listCertificatesForStaff,
  type CertificateDirectory,
  type CertificateDirectoryRow,
} from "@/features/certificates/services/certificate-directory";

export const instant = false;

export const metadata = { title: "Certificates", robots: { index: false, follow: false } };

const BASE = "/admin/certificates";

const TYPES: Record<string, { type: CertificateType; label: string; icon: LucideIcon }> = {
  internship: { type: CertificateType.INTERNSHIP_COMPLETION, label: "Internship", icon: Briefcase },
  training: { type: CertificateType.TRAINING_COMPLETION, label: "Industrial Training", icon: BookOpen },
  ambassador: { type: CertificateType.CAMPUS_AMBASSADOR, label: "Campus Ambassador", icon: Megaphone },
};
const TYPE_BY_ENUM = Object.fromEntries(Object.values(TYPES).map((item) => [item.type, item])) as Record<CertificateType, (typeof TYPES)[string]>;

const STATUSES: Record<string, { status: CertificateStatus; label: string; variant: "success" | "destructive" | "outline" }> = {
  active: { status: CertificateStatus.ACTIVE, label: "Active", variant: "success" },
  revoked: { status: CertificateStatus.REVOKED, label: "Revoked", variant: "destructive" },
  superseded: { status: CertificateStatus.SUPERSEDED, label: "Superseded", variant: "outline" },
};
const STATUS_BY_ENUM = Object.fromEntries(Object.values(STATUSES).map((item) => [item.status, item])) as Record<CertificateStatus, (typeof STATUSES)[string]>;

const PRINT_LABELS: Record<string, string> = { PAID: "Print ordered", PRINTED: "Printed", SHIPPED: "Print shipped", DELIVERED: "Print delivered" };

const actionLink =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

type Params = { type?: string; status?: string; q?: string };

function hrefWith(current: Params, change: Partial<Params>): string {
  const next = { ...current, ...change };
  const search = new URLSearchParams();
  if (next.type) search.set("type", next.type);
  if (next.status) search.set("status", next.status);
  if (next.q) search.set("q", next.q);
  const text = search.toString();
  return text ? `${BASE}?${text}` : BASE;
}

function CertificateCard({ certificate }: { certificate: CertificateDirectoryRow }) {
  const type = TYPE_BY_ENUM[certificate.type];
  const status = STATUS_BY_ENUM[certificate.status];
  const Icon = type.icon;
  const active = certificate.status === CertificateStatus.ACTIVE;
  return (
    <li className={cn("rounded-xl border border-border bg-card p-4 shadow-xs transition-colors hover:border-primary/40 sm:p-5", !active && "bg-muted/20")}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <span
            aria-hidden="true"
            className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0 space-y-1.5">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
              <span className="wrap-break-word">{certificate.recipientName}</span>
              <Badge variant={status.variant} className="text-[10px]">
                {status.label}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {type.label}
              </Badge>
              {certificate.versionNumber > 1 && (
                <Badge variant="secondary" className="text-[10px]">
                  v{certificate.versionNumber}
                </Badge>
              )}
            </p>
            <p className="text-xs text-foreground/80 wrap-break-word">{certificate.programmeTitle}</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <li className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                Issued {formatBatchDay(certificate.issueDate)}
              </li>
              <li className="inline-flex items-center gap-1.5 font-mono">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {certificate.verificationCode}
              </li>
              {certificate.issuedBy && (
                <li className="inline-flex items-center gap-1.5">
                  <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                  {certificate.issuedBy}
                </li>
              )}
              {certificate.printStatus && (
                <li className="inline-flex items-center gap-1.5 text-primary">
                  <Package className="h-3.5 w-3.5" aria-hidden="true" />
                  {PRINT_LABELS[certificate.printStatus] ?? certificate.printStatus}
                </li>
              )}
            </ul>
            {certificate.revocationReason && <p className="text-xs text-destructive">Reason: {certificate.revocationReason}</p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {active && (
            <a href={`/api/certificates/${certificate.id}/download`} className={actionLink}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Download
            </a>
          )}
          <a href={`/verify/${certificate.verificationCode}`} target="_blank" rel="noopener noreferrer" className={actionLink}>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Verify
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          {certificate.sourceHref && (
            <Link href={certificate.sourceHref} className={actionLink}>
              <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />
              Open record
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

export default async function AdminCertificatesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=${BASE}`);
  const raw = await searchParams;
  const params: Params = {
    type: raw.type && TYPES[raw.type] ? raw.type : undefined,
    status: raw.status && STATUSES[raw.status] ? raw.status : undefined,
    q: typeof raw.q === "string" ? raw.q.trim().slice(0, 100) || undefined : undefined,
  };

  let data: CertificateDirectory;
  try {
    data = await listCertificatesForStaff(user, {
      type: params.type ? TYPES[params.type].type : null,
      status: params.status ? STATUSES[params.status].status : null,
      query: params.q ?? "",
    });
  } catch (error) {
    if (error instanceof ForbiddenError) return <UnauthorizedState message="Only administrators can see every certificate." />;
    throw error;
  }
  const { totals } = data;

  return (
    <div className="w-full space-y-6">
      <StatGrid columns={4} label="Certificate summary">
        <StatCard label="Active Certificates" value={totals.active} icon={Award} tone="blue" href={hrefWith({}, { status: "active" })} />
        <StatCard label="Internship" value={totals.activeInternship} icon={Briefcase} tone="violet" href={hrefWith({}, { type: "internship", status: "active" })} />
        <StatCard label="Industrial Training" value={totals.activeTraining} icon={BookOpen} tone="emerald" href={hrefWith({}, { type: "training", status: "active" })} />
        <StatCard label="Campus Ambassador" value={totals.activeAmbassador} icon={Megaphone} tone="amber" href={hrefWith({}, { type: "ambassador", status: "active" })} />
      </StatGrid>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Filter by certificate type" className="flex flex-wrap gap-2">
            <FilterChipLink href={hrefWith(params, { type: undefined })} active={!params.type} label="All types" />
            {Object.entries(TYPES).map(([key, item]) => (
              <FilterChipLink key={key} href={hrefWith(params, { type: key })} active={params.type === key} label={item.label} />
            ))}
          </nav>
          <ExportLinks items={[{ dataset: "certificates", label: "Certificates CSV" }]} />
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <form action={BASE} method="get" role="search" className="relative w-full max-w-md">
            {params.type && <input type="hidden" name="type" value={params.type} />}
            {params.status && <input type="hidden" name="status" value={params.status} />}
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              name="q"
              defaultValue={params.q ?? ""}
              aria-label="Search certificates"
              placeholder="Search name, programme or code"
              className={cn(fieldInputClass, fieldOkBorder, "pl-10")}
            />
          </form>
          <nav aria-label="Filter by status" className="inline-flex w-fit gap-1 rounded-xl border border-border bg-muted/40 p-1">
            {[
              { key: undefined, label: `All ${totals.all}` },
              { key: "active", label: `Active ${totals.active}` },
              { key: "revoked", label: `Revoked ${totals.revoked}` },
              { key: "superseded", label: `Superseded ${totals.superseded}` },
            ].map((item) => {
              const active = params.status === item.key;
              return (
                <Link
                  key={item.label}
                  href={hrefWith(params, { status: item.key })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {data.certificates.length === 0 ? (
        <EmptyState
          title={totals.all === 0 ? "No certificate issued yet" : "No certificate matches these filters"}
          action={
            totals.all > 0 ? (
              <Link href={BASE} className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">
                Clear filters
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3" aria-label="Certificates">
          {data.certificates.map((certificate) => (
            <CertificateCard key={certificate.id} certificate={certificate} />
          ))}
        </ul>
      )}
    </div>
  );
}
