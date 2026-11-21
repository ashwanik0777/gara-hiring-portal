import Link from "next/link";
import { LegalList, LegalPage, LegalSection, buildLegalMetadata } from "@/components/legal/legal-page";
import { COMPANY } from "@/config/site";
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

export const metadata = buildLegalMetadata(
  "Shipping & Delivery Policy",
  "How GARA Innovation delivers its services: internships, jobs and training are delivered online, digital certificates in your dashboard, and optional printed certificates through your college or by courier.",
  "/shipping-policy"
);

const linkClass = "font-medium text-primary hover:underline underline-offset-4";

export default async function ShippingPolicyPage() {
  const offer = await getPublicPrintOffer();
  const options = offer.open ? printOptionLines(offer) : [];
  return (
    <LegalPage
      title="Shipping & Delivery Policy"
      path="/shipping-policy"
      summary="What we deliver, how and when."
    >
      <LegalSection id="services" title="1. Internships, jobs and training">
        <p>
          These are services, so nothing is shipped. After you enrol in Industrial Training, your batch schedule and
          learning material appear in your training dashboard on this portal.
        </p>
      </LegalSection>

      <LegalSection id="digital-certificates" title="2. Digital certificates">
        <p>
          Your digital certificate is included in the training fee (and is free for internships). It is available in your
          dashboard as soon as it is issued, and anyone can verify it on the{" "}
          <Link href="/verify" className={linkClass}>
            verification page
          </Link>
          . Nothing is shipped.
        </p>
      </LegalSection>

      <LegalSection id="printed-certificates" title="3. Printed certificates (optional add-on)">
        <p>You can order a printed copy of an issued certificate, delivered in one of two ways:</p>
        <LegalList>
          <li>in bulk through your college, or</li>
          <li>by courier to an address you give us.</li>
        </LegalList>
        {options.length > 0 ? (
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
        ) : (
          <p>
            The price, the expected delivery time and the tracking details are shown before and after you order. Printed
            orders are not open yet; this section will be completed before they open.
          </p>
        )}
      </LegalSection>

      <LegalSection id="problems" title="4. Delivery problems">
        <p>
          If a printed certificate does not arrive or arrives damaged, write to{" "}
          <a href={`mailto:${COMPANY.contactEmail}`} className={linkClass}>
            {COMPANY.contactEmail}
          </a>{" "}
          with your order details.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
