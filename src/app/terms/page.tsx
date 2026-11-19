import Link from "next/link";
import { LegalList, LegalPage, LegalSection, buildLegalMetadata, timesText } from "@/components/legal/legal-page";
import { COMPANY, TRAINING_POLICY } from "@/config/site";

export const metadata = buildLegalMetadata(
  "Terms of Service",
  "The terms for using the GARA Innovation careers portal: accounts, free internships, full-time roles, paid Industrial Training, certificates and the Campus Ambassador code of conduct.",
  "/terms"
);

const linkClass = "font-medium text-primary hover:underline underline-offset-4";

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      path="/terms"
      summary={`These terms apply when you use this careers portal run by ${COMPANY.brandName} ("GARA", "we"). By creating an account, applying, enrolling or joining a programme, you agree to them.`}
    >
      <LegalSection id="accounts" title="1. Your account">
        <LegalList>
          <li>Give accurate information and keep it up to date. One account per person.</li>
          <li>
            Keep your password private. Every password sign-in also needs a one-time code sent to your email, so keep
            your email account secure too.
          </li>
          <li>
            A public sign-up is always a candidate account. Staff access is given only by GARA, never by signing up.
          </li>
          <li>We may suspend an account that breaks these terms or puts other users at risk.</li>
        </LegalList>
      </LegalSection>

      <LegalSection id="internships" title="2. Internships are free">
        <p>
          GARA never charges a fee, deposit, registration charge or certificate fee for an internship, at any stage. If
          anyone asks you to pay for a GARA internship, do not pay and report it to{" "}
          <a href={`mailto:${COMPANY.contactEmail}`} className={linkClass}>
            {COMPANY.contactEmail}
          </a>
          .
        </p>
        <LegalList>
          <li>
            Selection usually follows these steps: application, screening and interviews, a 7-working-day supervised
            evaluation, and an offer with a tenure agreed with you.
          </li>
          <li>Any stipend is as stated on the opening and in your offer letter.</li>
          <li>You can apply to each opening once. Selection decisions are made by GARA.</li>
        </LegalList>
      </LegalSection>

      <LegalSection id="full-time-roles" title="3. Full-time roles">
        <p>
          Offers are made in writing on the portal. Accepting an offer by typing your name is a valid electronic
          signature; the terms of employment are those in your offer letter.
        </p>
      </LegalSection>

      <LegalSection id="industrial-training" title="4. Industrial Training">
        <LegalList>
          <li>
            Industrial Training is a paid programme. The fee pays for the training and mentorship and includes your
            digital certificate. A printed certificate is an optional add-on.
          </li>
          <li>
            The fee, schedule, seats and pass criteria of each programme are shown on its page before you pay. Payments
            are processed by Razorpay.
          </li>
          <li>
            Refunds and batch transfers follow our{" "}
            <Link href="/refund-policy" className={linkClass}>
              Refund &amp; Cancellation Policy
            </Link>
            .
          </li>
          <li>
            To pass, you must meet the programme&apos;s pass criteria (for example minimum marks and attendance, a final
            project and a live demo). If you do not pass, you can re-attempt in a later batch free of charge,{" "}
            {timesText(TRAINING_POLICY.freeReattempts)}.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="certificates" title="5. Certificates">
        <LegalList>
          <li>A certificate is issued only when the completion criteria are met and GARA approves it.</li>
          <li>
            Every certificate has a unique ID and QR code. Anyone can check it on the{" "}
            <Link href="/verify" className={linkClass}>
              verification page
            </Link>
            .
          </li>
          <li>
            GARA may revoke a certificate for plagiarism, misconduct, false information or an error in issuing it. A
            revoked certificate shows as revoked on the verification page.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="campus-ambassadors" title="6. Campus Ambassador code of conduct">
        <p>Being a Campus Ambassador is free. As an ambassador you must:</p>
        <LegalList>
          <li>never collect money from anyone on GARA&apos;s behalf;</li>
          <li>never make promises GARA does not make, such as a placement guarantee;</li>
          <li>use only the official materials GARA provides;</li>
          <li>not refer yourself, create fake accounts or send spam.</li>
        </LegalList>
        <p>
          Commission is earned per paid enrolment, becomes payable only after that batch&apos;s refund window has closed
          and is reversed if the enrolment is refunded. GARA may end an ambassador role that breaks this code and
          withhold commission earned through abuse.
        </p>
      </LegalSection>

      <LegalSection id="acceptable-use" title="7. Acceptable use">
        <p>
          Do not try to break into the portal or other accounts, copy data from it automatically, upload harmful files,
          impersonate anyone or misuse other people&apos;s data. Submit only work and information that is your own and
          true.
        </p>
      </LegalSection>

      <LegalSection id="liability" title="8. Limitation of liability">
        <p>
          We work to keep the portal available and accurate, but it is provided as it is. To the extent the law allows,
          GARA is not liable for indirect or consequential losses, and our total liability for a paid programme is
          limited to the fee you paid for it.
        </p>
      </LegalSection>

      <LegalSection id="changes-and-law" title="9. Changes and governing law">
        <p>
          We may update these terms; the date at the top shows the latest version. These terms are governed by the laws
          of India. Questions:{" "}
          <Link href="/contact" className={linkClass}>
            contact us
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
