import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import type { Metadata } from "next";
import { ArrowLeft, Download } from "lucide-react";
import { requirePortalCapability } from "@/features/lifecycle/services/lifecycle-service";
import { linkButtonClass } from "@/features/lifecycle/components/self-service-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";
import { getRazorpayConfig } from "@/infrastructure/payments/razorpay";
import { DELIVERY_LABELS, listMyPrintOrders } from "@/features/print-orders/services/print-order-service";
import { getPrintOffer } from "@/features/print-orders/services/print-settings-service";
import { ZONE_LABELS } from "@/features/print-orders/pricing";
import { PrintOrderForm } from "@/features/print-orders/components/print-order-forms";
import { formatInr } from "@/features/training/money";
import { formatBatchDay } from "@/features/training/components/batch-dates";

export const instant = false;

export const metadata: Metadata = { title: "Printed Certificate", robots: { index: false, follow: false } };

const STATUS_LABELS: Record<string, string> = { PAID: "Ordered", PRINTED: "Printed", SHIPPED: "Shipped", DELIVERED: "Delivered" };

export default async function PrintCertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requirePortalCapability("training", { callbackPath: `/candidate/training/${id}/print` });
  if (!z.uuid().safeParse(id).success) notFound();

  const enrollment = await prisma.trainingEnrollment.findUnique({
    where: { id },
    select: {
      userId: true,
      status: true,
      certificate: { select: { id: true, status: true, verificationCode: true } },
    },
  });
  if (!enrollment || enrollment.userId !== user.id || !enrollment.certificate) notFound();
  const certificate = enrollment.certificate;
  const [orders, profile, offer] = await Promise.all([
    listMyPrintOrders(user.id, certificate.id),
    prisma.candidateProfile.findUnique({ where: { userId: user.id }, select: { college: { select: { name: true } } } }),
    getPrintOffer(),
  ]);
  const open = certificate.status === "ACTIVE" && offer.open && getRazorpayConfig() !== null;

  return (
    <div className="w-full space-y-6">
      <Link href={`/candidate/training/${id}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Learning area
      </Link>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Printed certificate</h2>
        <span className="rounded-lg bg-muted/60 px-2.5 py-1 font-mono text-xs text-muted-foreground">{certificate.verificationCode}</span>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Order a printed copy</CardTitle>
        </CardHeader>
        <CardContent>
          {open ? (
            <PrintOrderForm certificateId={certificate.id} offer={offer} defaultName={user.name} collegeName={profile?.college?.name ?? null} />
          ) : (
            <p className="text-sm text-muted-foreground">Printed copies cannot be ordered right now.</p>
          )}
        </CardContent>
      </Card>

      {orders.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your orders</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/60 text-sm">
              {orders.map((order) => (
                <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">
                      {DELIVERY_LABELS[order.deliveryType]}
                      {order.deliveryZone ? ` (${ZONE_LABELS[order.deliveryZone].toLowerCase()})` : ""} · {formatInr(order.amountPaise)}{" "}
                      <Badge variant={order.status === "DELIVERED" ? "success" : "outline"}>{STATUS_LABELS[order.status] ?? order.status}</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {order.paidAt ? `Paid ${formatBatchDay(order.paidAt)}` : ""}
                      {order.expectedDelivery && !order.deliveredAt && !order.trackingNo ? ` · expected in ${order.expectedDelivery}` : ""}
                      {order.trackingNo ? ` · ${order.courierName ?? "Courier"} tracking ${order.trackingNo}` : ""}
                      {order.deliveredAt ? ` · delivered ${formatBatchDay(order.deliveredAt)}` : ""}
                    </p>
                  </div>
                  {order.receiptNo && (
                    <a href={`/api/print-orders/${order.id}/receipt`} className={linkButtonClass("outline", "sm")}>
                      <Download className="h-3.5 w-3.5" aria-hidden="true" /> Receipt
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
