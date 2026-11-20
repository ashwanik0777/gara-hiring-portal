import Link from "next/link";
import { redirect } from "next/navigation";
import { PrintOrderStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DELIVERY_LABELS, listPrintOrdersForStaff, type StaffPrintOrder } from "@/features/print-orders/services/print-order-service";
import { AdvancePrintOrder } from "@/features/print-orders/components/print-order-forms";
import { formatInr } from "@/features/training/money";
import { formatBatchDay } from "@/features/training/components/batch-dates";
import { ExportLinks } from "@/features/exports/export-links";

export const instant = false;

export const metadata = { title: "Print Orders", robots: { index: false, follow: false } };

const FILTERS = ["ALL", "PAID", "PRINTED", "SHIPPED", "DELIVERED"] as const;

function Destination({ order }: { order: StaffPrintOrder }) {
  if (order.deliveryType === "COLLEGE_BULK") return <span>College: {order.collegeName}</span>;
  return (
    <span>
      {[order.addressLine1, order.addressLine2, order.city, order.state, order.pincode].filter(Boolean).join(", ")}
    </span>
  );
}

export default async function AdminPrintOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/admin/print-orders");
  const requested = (await searchParams).status?.toUpperCase();
  const filter = FILTERS.includes(requested as (typeof FILTERS)[number]) ? (requested as (typeof FILTERS)[number]) : "ALL";

  let orders: StaffPrintOrder[];
  try {
    orders = await listPrintOrdersForStaff(user, filter === "ALL" ? null : (filter as PrintOrderStatus));
  } catch (error) {
    if (error instanceof ForbiddenError) return <UnauthorizedState message="Only administrators can manage print orders." />;
    throw error;
  }

  return (
    <div className="w-full space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Print Orders</h2>
        <p className="text-sm text-muted-foreground">Paid printed certificate orders: print, ship (with tracking for courier orders) and mark delivered.</p>
        <div className="mt-3">
          <ExportLinks items={[{ dataset: "print-orders", label: "Print orders CSV" }]} />
        </div>
      </div>
      <nav aria-label="Filter print orders" className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Link
            key={item}
            href={item === "ALL" ? "/admin/print-orders" : `/admin/print-orders?status=${item.toLowerCase()}`}
            aria-current={item === filter ? "page" : undefined}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium ${item === filter ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
          >
            {item === "ALL" ? "All" : item.charAt(0) + item.slice(1).toLowerCase()}
          </Link>
        ))}
      </nav>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Orders ({orders.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No paid order yet.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {orders.map((order) => (
                <li key={order.id} className="grid grid-cols-1 gap-3 py-4 lg:grid-cols-12">
                  <div className="space-y-1 text-sm lg:col-span-7">
                    <p className="font-medium">
                      {order.certificate.recipientName} · {order.certificate.programmeTitle} <Badge variant="outline">{order.status.toLowerCase()}</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {DELIVERY_LABELS[order.deliveryType]} · to {order.recipientName}, {order.phone} · {order.user.email}
                    </p>
                    <p className="text-xs">
                      <Destination order={order} />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Certificate {order.certificate.verificationCode} · {formatInr(order.amountPaise)} · receipt {order.receiptNo ?? "—"}
                      {order.paidAt ? ` · paid ${formatBatchDay(order.paidAt)}` : ""}
                      {order.trackingNo ? ` · tracking ${order.trackingNo}` : ""} ·{" "}
                      <a href={`/api/certificates/${order.certificate.id}/download`} className="font-medium text-primary hover:underline">
                        Certificate PDF
                      </a>
                    </p>
                  </div>
                  <div className="lg:col-span-5">
                    <AdvancePrintOrder orderId={order.id} status={order.status} deliveryType={order.deliveryType} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
