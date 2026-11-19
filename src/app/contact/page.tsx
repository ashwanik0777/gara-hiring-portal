import Link from "next/link";
import { LegalFact, LegalList, LegalPage, LegalSection, buildLegalMetadata } from "@/components/legal/legal-page";
import { COMPANY, SOCIAL_PROFILES, confirmedCompanyFacts } from "@/config/site";

export const metadata = buildLegalMetadata(
  "Contact Us",
  "Contact GARA Innovation about internships, jobs, Industrial Training, payments and refunds, certificates or your personal data.",
  "/contact"
);

const linkClass = "font-medium text-primary hover:underline underline-offset-4";

/** Statutory details appear only once the product owner has confirmed them (src/config/site.ts). */
const COMPANY_FACTS = confirmedCompanyFacts();

const SOCIAL_LABELS: Record<keyof typeof SOCIAL_PROFILES, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  twitter: "X (Twitter)",
  youtube: "YouTube",
};

export default function ContactPage() {
  return (
    <LegalPage
      title="Contact Us"
      path="/contact"
      showLastUpdated={false}
      summary={`How to reach ${COMPANY.brandName} about applications, training, payments, certificates or your data.`}
    >
      <LegalSection id="email" title="Email">
        <LegalFact label="Email">
          <a href={`mailto:${COMPANY.contactEmail}`} className={linkClass}>
            {COMPANY.contactEmail}
          </a>
        </LegalFact>
        <p>Write from the email address on your account so we can find your records. It helps to include:</p>
        <LegalList>
          <li>the opening or programme name, for applications and training;</li>
          <li>the payment reference from your receipt, for payments and refunds;</li>
          <li>the certificate ID, for certificate questions;</li>
          <li>the word &quot;Privacy&quot; in the subject, for data requests and grievances.</li>
        </LegalList>
      </LegalSection>

      {COMPANY_FACTS.length > 0 && (
        <LegalSection id="company" title="Company details">
          <address className="not-italic space-y-1">
            {COMPANY_FACTS.map((fact) => (
              <LegalFact key={fact.label} label={fact.label}>
                {fact.value}
              </LegalFact>
            ))}
          </address>
        </LegalSection>
      )}

      <LegalSection id="self-service" title="Answers without waiting">
        <LegalList>
          <li>
            <Link href="/help" className={linkClass}>
              Help &amp; FAQ
            </Link>{" "}
            for common questions about applying and the evaluation.
          </li>
          <li>
            <Link href="/verify" className={linkClass}>
              Verify a certificate
            </Link>{" "}
            with its certificate ID.
          </li>
          <li>Your dashboard shows the status of your applications after you sign in.</li>
        </LegalList>
      </LegalSection>

      <LegalSection id="social" title="Social media">
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {(Object.keys(SOCIAL_LABELS) as Array<keyof typeof SOCIAL_PROFILES>).map((key) => (
            <li key={key}>
              <a href={SOCIAL_PROFILES[key]} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {SOCIAL_LABELS[key]}
              </a>
            </li>
          ))}
        </ul>
      </LegalSection>
    </LegalPage>
  );
}
