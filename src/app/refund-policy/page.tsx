import Link from "next/link";
import {
  LegalList,
  LegalPage,
  LegalSection,
  buildLegalMetadata,
  timesText,
} from "@/components/legal/legal-page";
import { COMPANY, TRAINING_POLICY } from "@/config/site";

export const metadata = buildLegalMetadata(
  "Refund & Cancellation Policy",
  `Internships at GARA Innovation are free. Industrial Training fees are refunded, minus the payment gateway charges, before the batch starts or within ${TRAINING_POLICY.refundHoursAfterFirstClass} hours after the first live class; after that a free batch transfer is available.`,
  "/refund-policy"
);

const linkClass = "font-medium text-primary hover:underline underline-offset-4";

export default function RefundPolicyPage() {
  const hours = TRAINING_POLICY.refundHoursAfterFirstClass;

  return (
    <LegalPage
      title="Refund & Cancellation Policy"
      path="/refund-policy"
      summary="When you can get your money back for Industrial Training, how to ask for it and what happens after the refund window closes."
    >
      <LegalSection id="internships-and-jobs" title="1. Internships and jobs">
        <p>
          Internships and job applications at {COMPANY.brandName} are free. There is never anything to pay, so there is
          nothing to refund.
        </p>
      </LegalSection>

      <LegalSection id="training-refunds" title="2. Industrial Training: refund window">
        <p>You get a refund of the fee you paid, minus the payment gateway charges, if you ask for it:</p>
        <LegalList>
          <li>
            <strong className="text-foreground">before your batch&apos;s start date</strong>, or
          </li>
          <li>
            <strong className="text-foreground">within {hours} hours after the first live class</strong> of your batch.
          </li>
        </LegalList>
        <p>
          The time of your request decides whether it is inside the window, even if we process it later.
          {TRAINING_POLICY.deductGatewayChargesFromRefunds
            ? " The payment gateway charges, which are Razorpay's fee for your payment and the GST on that fee, are not returned to us by Razorpay and are deducted from the refund. The exact amount is shown when your refund is approved."
            : " Refunds are for the full amount you paid; no gateway or processing charges are deducted."}
        </p>
      </LegalSection>

      <LegalSection id="after-the-window" title="3. After the refund window: one free transfer">
        <p>
          Once the window has closed, the fee is not refundable. Instead, you can move to the next batch free of charge,{" "}
          {timesText(TRAINING_POLICY.freeTransfers)}.
        </p>
      </LegalSection>

      <LegalSection id="how-to-ask" title="4. How to ask for a refund or transfer">
        <LegalList>
          <li>Use the &quot;Request refund&quot; or &quot;Transfer&quot; button in your training dashboard, or</li>
          <li>
            email{" "}
            <a href={`mailto:${COMPANY.contactEmail}`} className={linkClass}>
              {COMPANY.contactEmail}
            </a>{" "}
            from your account&apos;s email address with your payment reference.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="processing" title="5. How refunds are paid">
        <p>
          Approved refunds are sent through Razorpay to the card, UPI account or bank account you paid with. Banks usually
          take 5–7 working days to show the money in your account. You get an email when the refund is processed.
        </p>
      </LegalSection>

      <LegalSection id="not-a-refund" title="6. Not passing the programme">
        <p>
          Not meeting the pass criteria is not a reason for a refund. You can re-attempt in a later batch free of charge,{" "}
          {timesText(TRAINING_POLICY.freeReattempts)} (see the{" "}
          <Link href="/terms" className={linkClass}>
            Terms of Service
          </Link>
          ).
        </p>
      </LegalSection>

      <LegalSection id="printed-certificates" title="7. Printed certificates">
        <p>
          The printed certificate is an optional add-on. Its delivery terms are in the{" "}
          <Link href="/shipping-policy" className={linkClass}>
            Shipping &amp; Delivery Policy
          </Link>
          ; its refund terms will be published here before printed orders open.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
