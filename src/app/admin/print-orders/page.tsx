import Link from "next/link";
import { redirect } from "next/navigation";
import { PrintOrderStatus } from "@prisma/client";
import { Building2, CheckCircle2, Clock, Download, Mail, MapPin, Package, PackageCheck, PauseCircle, Phone, Printer, ReceiptText, Settings, Truck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { countPrintOrdersByStatus, listPrintOrdersForStaff, type StaffPrintOrder } from "@/features/print-orders/services/print-order-service";
import { readPrintSettings, toPrintOffer, type PrintSettingsValues } from "@/features/print-orders/services/print-settings-service";
import { ZONE_LABELS } from "@/features/print-orders/pricing";
import { AdvancePrintOrder } from "@/features/print-orders/components/print-order-forms";
import { FilterChipLink } from "@/features/employees/components/filter-chip-link";
import { formatInr } from "@/features/training/money";
import { formatBatchDay } from "@/features/training/components/batch-dates";
import { ExportLinks } from "@/features/exports/export-links";

export const instant = false;

export const metadata = { title: "Print Orders", robots: { index: false, follow: false } };

const BASE = "/admin/print-orders";
const STATUSES = ["PAID", "PRINTED", "SHIPPED", "DELIVERED"] as const;
type Status = (typeof STATUSES)[number];
const STATUS_META: Record<Status, { label: string; chip: string; variant: "warning" | "default" | "secondary" | "success" }> = {
  PAID: { label: "To print", chip: "To print", variant: "warning" },
  PRINTED: { label: "Printed", chip: "Ready to ship", variant: "default" },
  SHIPPED: { label: "Shipped", chip: "Shipped", variant: "secondary" },
  DELIVERED: { label: "Delivered", chip: "Delivered", variant: "success" },
};

const actionLink =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

function Steps({ order }: { order: StaffPrintOrder }) {
  const steps = [
    { key: "PAID", label: "Paid", at: order.paidAt },
    { key: "PRINTED", label: "Printed", at: order.printedAt },
    { key: "SHIPPED", label: "Shipped", at: order.shippedAt },
    { key: "DELIVERED", label: "Delivered", at: order.deliveredAt },
  ];
  const reached = STATUSES.indexOf(order.status as Status);
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label="Order progress">
      {steps.map((step, index) => {
        const done = index <= reached;
        return (
          <li key={step.key} className="space-y-1.5">
            <div className={cn("h-1.5 rounded-full", done ? "bg-primary" : "bg-muted-foreground/15")} />
            <p className={cn("text-[11px] font-medium", done ? "text-foreground" : "text-muted-foreground")}>
              {step.label}
              <span className="sr-only">{done ? " (done)" : " (not yet)"}</span>
            </p>
            {step.at && <p className="text-[10px] text-muted-foreground">{formatBatchDay(step.at)}</p>}
          </li>
        );
      })}
    </ol>
  );
}

function OrderCard({ order }: { order: StaffPrintOrder }) {
  const meta = STATUS_META[order.status as Status];
  const courier = order.deliveryType === "COURIER";
  const destination = courier
    ? [order.addressLine1, order.addressLine2, order.city, order.state, order.pincode].filter(Boolean).join(", ")
    : order.collegeName ?? "College not set";
  return (
    <li className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-4 border-b border-border/60 p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {courier ? <Truck className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
          </span>
          <div className="min-w-0 space-y-1.5">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
              {order.certificate.recipientName}
              {meta && (
                <Badge variant={meta.variant} className="text-[10px]">
                  {meta.label}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">
                {courier ? "Courier" : "College bulk"}
              </Badge>
              {order.deliveryZone && (
                <Badge variant="secondary" className="text-[10px]">
                  {ZONE_LABELS[order.deliveryZone]}
                </Badge>
              )}
            </p>
            <p className="text-xs text-foreground/80 wrap-break-word">{order.certificate.programmeTitle}</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <li className="inline-flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" aria-hidden="true" />
                To {order.recipientName}
              </li>
              <li className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                {order.phone}
              </li>
              <li className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                {order.user.email}
              </li>
              {order.expectedDelivery && (
                <li className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {order.expectedDelivery}
                </li>
              )}
            </ul>
            <p className="inline-flex items-start gap-1.5 text-xs text-foreground/80">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="wrap-break-word">{destination}</span>
            </p>
          </div>
        </div>
        <div className="shrink-0 text-left lg:text-right">
          <p className="text-base font-bold tabular-nums text-foreground">{formatInr(order.amountPaise)}</p>
          <p className="text-xs text-muted-foreground">
            {order.receiptNo ?? "No receipt"}
            {order.paidAt ? ` · paid ${formatBatchDay(order.paidAt)}` : ""}
          </p>
          {order.trackingNo && (
            <p className="text-xs text-muted-foreground">
              {order.courierName ? `${order.courierName} · ` : ""}
              <span className="font-mono">{order.trackingNo}</span>
            </p>
          )}
        </div>
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        <Steps order={order} />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <a href={`/api/certificates/${order.certificate.id}/download`} className={actionLink}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Certificate PDF
            </a>
            <a href={`/api/print-orders/${order.id}/receipt`} className={actionLink}>
              <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
              Receipt
            </a>
            <span className="inline-flex h-8 items-center rounded-lg bg-muted/60 px-2.5 font-mono text-[11px] text-muted-foreground">{order.certificate.verificationCode}</span>
          </div>
          <AdvancePrintOrder orderId={order.id} status={order.status} deliveryType={order.deliveryType} />
        </div>
      </div>
    </li>
  );
}

export default async function AdminPrintOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=${BASE}`);
  const requested = (await searchParams).status?.toUpperCase();
  const filter = (STATUSES as readonly string[]).includes(requested ?? "") ? (requested as Status) : null;

  let orders: StaffPrintOrder[];
  let counts: Record<Status, number>;
  let settings: PrintSettingsValues;
  try {
    [orders, counts, settings] = await Promise.all([
      listPrintOrdersForStaff(user, filter as PrintOrderStatus | null),
      countPrintOrdersByStatus(user),
      readPrintSettings(),
    ]);
  } catch (error) {
    if (error instanceof ForbiddenError) return <UnauthorizedState message="Only administrators can manage print orders." />;
    throw error;
  }
  const total = STATUSES.reduce((sum, status) => sum + counts[status], 0);
  const href = (status: Status | null) => (status ? `${BASE}?status=${status.toLowerCase()}` : BASE);
  const offer = toPrintOffer(settings);
  const ordering = offer.open
    ? { label: "Ordering open", icon: CheckCircle2, tone: "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300" }
    : settings.orderingOpen || offer.collegeBulk || offer.courierNcr || offer.courierOutside
      ? { label: "Ordering paused", icon: PauseCircle, tone: "bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300" }
      : { label: "Ordering off: prices not set", icon: Settings, tone: "bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300" };
  const OrderingIcon = ordering.icon;

  return (
    <div className="w-full space-y-6">
      <StatGrid columns={4} label="Print order summary">
        <StatCard label="To Print" value={counts.PAID} icon={Printer} tone="amber" href={href("PAID")} />
        <StatCard label="Ready to Ship" value={counts.PRINTED} icon={Package} tone="blue" href={href("PRINTED")} />
        <StatCard label="Shipped" value={counts.SHIPPED} icon={Truck} tone="violet" href={href("SHIPPED")} />
        <StatCard label="Delivered" value={counts.DELIVERED} icon={PackageCheck} tone="emerald" href={href("DELIVERED")} />
      </StatGrid>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Filter print orders" className="flex flex-wrap gap-2">
          <FilterChipLink href={href(null)} active={filter === null} label="All" count={total} />
          {STATUSES.map((status) => (
            <FilterChipLink key={status} href={href(status)} active={filter === status} label={STATUS_META[status].chip} count={counts[status]} emphasis={status === "PAID"} />
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`${BASE}/settings`}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              ordering.tone
            )}
          >
            <OrderingIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {ordering.label}
            <span className="sr-only"> (print settings)</span>
          </Link>
          <ExportLinks items={[{ dataset: "print-orders", label: "Print orders CSV" }]} />
        </div>
      </div>

      {orders.length === 0 ? (
        <EmptyState title={filter ? `No orders ${STATUS_META[filter].chip.toLowerCase()}` : "No print orders yet"} />
      ) : (
        <ul className="grid grid-cols-1 gap-4" aria-label="Print orders">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </ul>
      )}
    </div>
  );
}
