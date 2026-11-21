import { Suspense } from "react";
import Link from "next/link";
import { LegalList, LegalPage, LegalSection, buildLegalMetadata } from "@/components/legal/legal-page";
import { COMPANY } from "@/config/site";
import { Skeleton } from "@/components/ui/skeleton";
import { PrintedCertificateOptions } from "./printed-certificate-options";

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
        {/* Prices come from the print settings: read per request, so the rest of the page stays static. */}
        <Suspense
          fallback={
            <div role="status" aria-label="Loading prices" className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          }
        >
          <PrintedCertificateOptions />
        </Suspense>
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
