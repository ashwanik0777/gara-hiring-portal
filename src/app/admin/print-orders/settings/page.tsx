import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/guards";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { readPrintSettings } from "@/features/print-orders/services/print-settings-service";
import { PrintSettingsForm } from "@/features/print-orders/components/print-settings-form";

export const instant = false;

export const metadata = { title: "Print Settings", robots: { index: false, follow: false } };

const rupees = (paise: number | null) => (paise === null ? "" : String(Math.round(paise / 100)));

/** Rendered inside the admin portal shell, which provides the title and "Back to Print Orders". */
export default async function AdminPrintSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/admin/print-orders/settings");
  // The save action re-checks; this only avoids showing the form to non-administrators.
  if (!user.roles.includes(Role.ADMIN)) {
    return <UnauthorizedState message="Only administrators can change print settings." />;
  }

  const settings = await readPrintSettings();
  return (
    <PrintSettingsForm
      cancelHref="/admin/print-orders"
      initial={{
        orderingOpen: settings.orderingOpen,
        collegeBulkPrice: rupees(settings.collegeBulkPricePaise),
        courierNcrPrice: rupees(settings.courierNcrPricePaise),
        courierOutsidePrice: rupees(settings.courierOutsidePricePaise),
        collegeBulkDelivery: settings.collegeBulkDelivery ?? "",
        courierNcrDelivery: settings.courierNcrDelivery ?? "",
        courierOutsideDelivery: settings.courierOutsideDelivery ?? "",
        ncrPinPrefixes: settings.ncrPinPrefixes.join(", "),
        courierPartner: settings.courierPartner ?? "",
      }}
    />
  );
}
