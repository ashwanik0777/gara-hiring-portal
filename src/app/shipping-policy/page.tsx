import Link from "next/link";
import { LegalList, LegalPage, LegalSection, buildLegalMetadata } from "@/components/legal/legal-page";
import { COMPANY, PRINTED_CERTIFICATE } from "@/config/site";
import { formatInr } from "@/features/training/money";

/** Delivery options with a price set (Phase 3C). */
const PRINT_OPTIONS = (["COLLEGE_BULK", "COURIER"] as const)
  .map((type) => ({ type, price: PRINTED_CERTIFICATE.pricesPaise[type], expectedDelivery: PRINTED_CERTIFICATE.expectedDelivery[type] }))
  .filter((option): option is { type: "COLLEGE_BULK" | "COURIER"; price: number; expectedDelivery: string | null } => option.price !== null && option.price > 0);

export const metadata = buildLegalMetadata(
  "Shipping & Delivery Policy",
  "How GARA Innovation delivers its services: internships, jobs and training are delivered online, digital certificates in your dashboard, and optional printed certificates through your college or by courier.",
  "/shipping-policy"
);

const linkClass = "font-medium text-primary hover:underline underline-offset-4";

export default function ShippingPolicyPage() {
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
        {PRINT_OPTIONS.length > 0 ? (
          <>
            <LegalList>
              {PRINT_OPTIONS.map((option) => (
                <li key={option.type}>
                  {option.type === "COURIER" ? "Courier" : "Bulk through your college"}: {formatInr(option.price)}
                  {option.expectedDelivery ? `, usually ${option.expectedDelivery}` : ""}.
                </li>
              ))}
            </LegalList>
            <p>
              You order and pay from your training page; tracking details appear there and in an email once the certificate is
              sent{PRINTED_CERTIFICATE.courierPartner ? ` (courier partner: ${PRINTED_CERTIFICATE.courierPartner})` : ""}.
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
