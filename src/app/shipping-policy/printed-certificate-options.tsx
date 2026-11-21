import { connection } from "next/server";
import { LegalList } from "@/components/legal/legal-page";
import { formatInr } from "@/features/training/money";
import type { PrintOffer, PrintPrice } from "@/features/print-orders/pricing";
import { getPublicPrintOffer } from "@/features/print-orders/services/print-settings-service";

/** "110, 201 or 122". */
function joinOr(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

/** Priced delivery options from the administrators' print settings. */
function printOptionLines(offer: PrintOffer): Array<{ key: string; label: string; price: PrintPrice }> {
  const lines: Array<{ key: string; label: string; price: PrintPrice }> = [];
  if (offer.collegeBulk) lines.push({ key: "bulk", label: "Bulk through your college", price: offer.collegeBulk });
  if (offer.courierNcr) {
    lines.push({ key: "ncr", label: `Courier within NCR (PIN codes starting with ${joinOr(offer.ncrPinPrefixes)})`, price: offer.courierNcr });
  }
  if (offer.courierOutside) lines.push({ key: "outside", label: offer.courierNcr ? "Courier outside NCR" : "Courier", price: offer.courierOutside });
  return lines;
}

/**
 * Printed certificate prices and delivery times in the Shipping & Delivery Policy. Administrators
 * change them in Print Settings, so they are read per request (never at build time, when there
 * is no database) from a cache that is refreshed whenever the settings are saved.
 */
export async function PrintedCertificateOptions() {
  await connection();
  let offer: PrintOffer;
  try {
    offer = await getPublicPrintOffer();
  } catch {
    return <p>The price and the expected delivery time are shown on your training page before you pay.</p>;
  }
  const options = offer.open ? printOptionLines(offer) : [];
  if (options.length === 0) {
    return (
      <p>
        The price, the expected delivery time and the tracking details are shown before and after you order. Printed orders
        are not open yet; this section will be completed before they open.
      </p>
    );
  }
  return (
    <>
      <LegalList>
        {options.map((option) => (
          <li key={option.key}>
            {option.label}: {formatInr(option.price.pricePaise)}
            {option.price.expectedDelivery ? `, usually ${option.price.expectedDelivery}` : ""}.
          </li>
        ))}
      </LegalList>
      <p>
        You order and pay from your training page; tracking details appear there and in an email once the certificate is
        sent{offer.courierPartner ? ` (courier partner: ${offer.courierPartner})` : ""}.
      </p>
    </>
  );
}
