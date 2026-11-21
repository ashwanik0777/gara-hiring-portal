import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Ban, CheckCircle2, ClipboardCheck, Hourglass, IndianRupee, Landmark, ReceiptText, type LucideIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { getPayoutsOverview, type PayoutsOverview } from "@/features/ambassadors/services/commission-service";
import { CommissionReviewCard, type ReviewMode } from "@/features/ambassadors/components/payout-review";
import { formatInr } from "@/features/training/money";
import { formatBatchDay } from "@/features/training/components/batch-dates";
import { ExportLinks } from "@/features/exports/export-links";

export const instant = false;

export const metadata = { title: "Ambassador Payouts", robots: { index: false, follow: false } };

const TABS = [
  { key: "review", label: "Review", icon: ClipboardCheck },
  { key: "pay", label: "Ready to pay", icon: IndianRupee },
  { key: "waiting", label: "Waiting", icon: Hourglass },
  { key: "declined", label: "Declined", icon: Ban },
  { key: "history", label: "History", icon: ReceiptText },
] as const satisfies ReadonlyArray<{ key: string; label: string; icon: LucideIcon }>;
type Tab = (typeof TABS)[number]["key"];

const BASE = "/admin/campus-ambassadors/payouts";

function parseTab(value: string | string[] | undefined): Tab {
  const raw = Array.isArray(value) ? value[0] : value;
  return TABS.some((tab) => tab.key === raw) ? (raw as Tab) : "review";
}

function Groups({ data, mode, empty }: { data: PayoutsOverview; mode: ReviewMode; empty: string }) {
  const groups = mode === "review" ? data.review : mode === "approved" ? data.approved : mode === "declined" ? data.declined : data.waiting;
  if (groups.length === 0) return <EmptyState title={empty} />;
  const globalReason = !data.razorpayXReady ? "RazorpayX not configured" : data.tdsPercent === null ? "TDS rule not decided" : null;
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {groups.map((group) => (
        <CommissionReviewCard
          key={group.ambassador.id}
          group={group}
          mode={mode}
          payment={
            mode === "approved"
              ? {
                  canUseRazorpayX: !globalReason && Boolean(group.ambassador.upiIdMasked),
                  razorpayXReason: globalReason ?? (group.ambassador.upiIdMasked ? null : "No UPI ID yet"),
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}

function History({ data }: { data: PayoutsOverview }) {
  if (data.payouts.length === 0) return <EmptyState title="No payout yet" />;
  return (
    <ul className="grid grid-cols-1 gap-3" aria-label="Payout history">
      {data.payouts.map((payout) => (
        <li key={payout.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                payout.status === "PAID" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : payout.status === "FAILED" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-600"
              )}
            >
              {payout.method === "MANUAL" ? <Landmark className="h-4 w-4" /> : <IndianRupee className="h-4 w-4" />}
            </span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                {payout.ambassador.user.name}
                <Badge variant={payout.status === "PAID" ? "success" : payout.status === "FAILED" ? "destructive" : "outline"} className="text-[10px]">
                  {payout.status === "PAID" ? "Paid" : payout.status === "FAILED" ? "Failed" : "Processing"}
                </Badge>
              </p>
              <p className="text-xs text-muted-foreground">
                {payout.method === "MANUAL" ? "Bank transfer" : "RazorpayX"} · {formatBatchDay(payout.paidAt ?? payout.createdAt)}
                {payout.utr ? ` · UTR ${payout.utr}` : ""}
              </p>
              {payout.failureReason && <p className="text-xs text-destructive">{payout.failureReason}</p>}
            </div>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-base font-bold tabular-nums text-foreground">{formatInr(payout.netPaise)}</p>
            <p className="text-xs tabular-nums text-muted-foreground">
              Gross {formatInr(payout.grossPaise)} · TDS {formatInr(payout.tdsPaise)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function AmbassadorPayoutsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=${BASE}`);
  await connection();
  const now = new Date();
  const tab = parseTab((await searchParams).tab);

  let data: PayoutsOverview;
  try {
    data = await getPayoutsOverview(user, now);
  } catch (error) {
    if (error instanceof ForbiddenError) return <UnauthorizedState message="Only administrators can pay ambassadors." />;
    throw error;
  }
  const { totals } = data;
  const counts: Record<Tab, number> = {
    review: totals.reviewCount,
    pay: totals.approvedCount,
    waiting: totals.waitingCount,
    declined: totals.declinedCount,
    history: data.payouts.length,
  };
  const href = (key: Tab) => (key === "review" ? BASE : `${BASE}?tab=${key}`);

  return (
    <div className="w-full space-y-6">
      <StatGrid columns={4} label="Payout summary">
        <StatCard label="Awaiting Review" value={totals.reviewCount} icon={ClipboardCheck} tone="amber" href={href("review")} />
        <StatCard label="Approved to Pay" value={formatInr(totals.approvedPaise)} icon={CheckCircle2} tone="blue" href={href("pay")} />
        <StatCard label="Paid Out" value={formatInr(totals.paidPaise)} icon={IndianRupee} tone="emerald" href={href("history")} />
        <StatCard label="Declined" value={totals.declinedCount} icon={Ban} tone="rose" href={href("declined")} />
      </StatGrid>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Payout sections" className="-mx-1 overflow-x-auto px-1">
          <div className="inline-flex min-w-full gap-1 rounded-xl border border-border bg-muted/40 p-1 sm:min-w-0">
            {TABS.map((item) => {
              const Icon = item.icon;
              const active = item.key === tab;
              return (
                <Link
                  key={item.key}
                  href={href(item.key)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  )}
                >
                  <Icon className={cn("h-4 w-4", active && "text-primary")} aria-hidden="true" />
                  {item.label}
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums", active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                    {counts[item.key]}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
        <ExportLinks items={[{ dataset: "ambassador-payouts", label: "Payouts CSV" }]} />
      </div>

      {tab === "review" && <Groups data={data} mode="review" empty="Nothing to review" />}
      {tab === "pay" && <Groups data={data} mode="approved" empty="Nothing approved to pay" />}
      {tab === "waiting" && <Groups data={data} mode="waiting" empty="No commission is waiting for its refund window" />}
      {tab === "declined" && <Groups data={data} mode="declined" empty="Nothing declined" />}
      {tab === "history" && <History data={data} />}
    </div>
  );
}
