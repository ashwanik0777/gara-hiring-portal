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
import { DELIVERY_LABELS, listMyPrintOrders, printOptions } from "@/features/print-orders/services/print-order-service";
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
      batch: { select: { program: { select: { title: true } } } },
      certificate: { select: { id: true, status: true, verificationCode: true } },
    },
  });
  if (!enrollment || enrollment.userId !== user.id || !enrollment.certificate) notFound();
  const certificate = enrollment.certificate;
  const [orders, profile] = await Promise.all([
    listMyPrintOrders(user.id, certificate.id),
    prisma.candidateProfile.findUnique({ where: { userId: user.id }, select: { college: { select: { name: true } } } }),
  ]);
  const options = printOptions();
  const open = certificate.status === "ACTIVE" && options.length > 0 && getRazorpayConfig() !== null;

  return (
    <div className="w-full space-y-6">
      <Link href={`/candidate/training/${id}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Learning area
      </Link>
      <header className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Printed certificate</h2>
        <p className="text-sm text-muted-foreground">
          {enrollment.batch.program.title} · certificate {certificate.verificationCode}. A printed copy is optional; your digital certificate is
          included and verifiable online. See the{" "}
          <Link href="/shipping-policy" className="font-medium text-primary hover:underline underline-offset-4">
            Shipping &amp; Delivery Policy
          </Link>
          .
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Order a printed copy</CardTitle>
        </CardHeader>
        <CardContent>
          {open ? (
            <PrintOrderForm certificateId={certificate.id} options={options} defaultName={user.name} collegeName={profile?.college?.name ?? null} />
          ) : (
            <p className="text-sm text-muted-foreground">Printed copies are not open yet. They will be available here.</p>
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
                      {DELIVERY_LABELS[order.deliveryType]} · {formatInr(order.amountPaise)} <Badge variant={order.status === "DELIVERED" ? "success" : "outline"}>{STATUS_LABELS[order.status] ?? order.status}</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {order.paidAt ? `Paid ${formatBatchDay(order.paidAt)}` : ""}
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
