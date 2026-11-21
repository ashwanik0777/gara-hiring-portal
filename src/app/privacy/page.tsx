import Link from "next/link";
import { LegalList, LegalPage, LegalSection, buildLegalMetadata } from "@/components/legal/legal-page";
import { COMPANY } from "@/config/site";

export const metadata = buildLegalMetadata(
  "Privacy Policy",
  "How GARA Innovation collects, uses, shares and protects personal data on its careers portal, and how to use your rights under India's Digital Personal Data Protection Act, 2023.",
  "/privacy"
);

const contactLink = (
  <a href={`mailto:${COMPANY.contactEmail}`} className="font-medium text-primary hover:underline underline-offset-4">
    {COMPANY.contactEmail}
  </a>
);

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      path="/privacy"
      
    >
      <LegalSection id="who-we-are" title="1. Who we are">
        <p>
          {COMPANY.registeredName ?? COMPANY.brandName} is a private limited company in India. We run this portal for
          internships, full-time roles, Industrial Training and the Campus Ambassador programme. For any question about
          your data, write to {contactLink}.
        </p>
      </LegalSection>

      <LegalSection id="data-we-collect" title="2. Data we collect">
        <LegalList>
          <li>
            <strong className="text-foreground">Account:</strong> your name, email address and password (stored only as a
            one-way hash). If you sign in with Google, we receive your name, email address and profile picture from
            Google. The one-time sign-in codes we email you are stored only in hashed form and expire after 10 minutes.
          </li>
          <li>
            <strong className="text-foreground">Profile and applications:</strong> phone number, location, current
            organisation, education, college, branch, year of study, graduation year, LinkedIn, GitHub and portfolio
            links, the link to your resume, your answers on application forms, how you heard about us and the campaign
            link you arrived from.
          </li>
          <li>
            <strong className="text-foreground">Selection:</strong> interview schedules, interviewer feedback,
            evaluation and task records, offer letters and your electronic acceptance (the name you type, the time, a
            keyed hash of your IP address and your browser&apos;s user agent).
          </li>
          <li>
            <strong className="text-foreground">Interns and employees:</strong> records needed for the engagement, such
            as attendance, leave and payroll. Bank account and PAN details are stored encrypted.
          </li>
          <li>
            <strong className="text-foreground">Industrial Training:</strong> your programme and batch, attendance,
            assignments, marks, project and demo results, and payment records (order and payment reference, amount,
            refund status). You enter card, UPI or bank details on Razorpay&apos;s checkout; they never reach us and we
            never store them.
          </li>
          <li>
            <strong className="text-foreground">Campus Ambassadors:</strong> your application, the activity on your
            referral code (clicks, sign-ups, applications and enrolments) and your UPI ID for payouts, stored encrypted.
          </li>
          <li>
            <strong className="text-foreground">Technical data:</strong> the IP address and browser user agent of your
            sign-in sessions, IP addresses used to limit repeated requests, and important account and administrative
            actions in an audit log that can include the IP address used. To count distinct visitors we use a random
            visitor ID, your browser&apos;s user agent and a keyed hash of your IP address (see the{" "}
            <Link href="/cookie-policy" className="font-medium text-primary hover:underline underline-offset-4">
              Cookie Policy
            </Link>
            ).
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="how-we-use-it" title="3. How we use your data">
        <LegalList>
          <li>To create and secure your account and to sign you in.</li>
          <li>To review applications, schedule interviews, run evaluations and prepare offers.</li>
          <li>To run training batches, grade work, issue certificates and handle payments, refunds and transfers.</li>
          <li>To run the Campus Ambassador programme, including referral tracking and payouts.</li>
          <li>To let anyone check that a GARA certificate is genuine.</li>
          <li>
            To send you service emails: sign-in codes, application updates, interview invitations, receipts and
            reminders.
          </li>
          <li>To keep the portal safe: preventing abuse and fraud, limiting repeated requests and keeping audit logs.</li>
          <li>To understand how people find us (application sources and visitor counts).</li>
        </LegalList>
        <p>We do not sell your data, show advertising or use your data for advertising profiles.</p>
      </LegalSection>

      <LegalSection id="consent" title="4. Consent and legal basis">
        <p>
          We process your data with the consent you give when you create an account, apply or enrol, and for the uses the
          Digital Personal Data Protection Act, 2023 allows without consent, such as employment-related purposes and
          complying with the law. You can withdraw consent at any time by writing to us. Withdrawal does not affect what
          was done before, but we may then be unable to continue your application, training or engagement.
        </p>
      </LegalSection>

      <LegalSection id="sharing" title="5. Who we share it with">
        <p>Only with service providers that work for us, and only what they need:</p>
        <LegalList>
          <li>Vercel, which hosts the portal.</li>
          <li>Neon, which hosts our database.</li>
          <li>Our email delivery provider, to send the emails described above.</li>
          <li>Google, only if you choose to sign in with Google.</li>
          <li>Razorpay, for training payments, refunds and Campus Ambassador payouts.</li>
        </LegalList>
        <p>
          Inside GARA, staff see only the records their role needs. We also disclose data when the law requires it. On the
          public certificate verification page, anyone with a certificate ID sees the holder&apos;s name, programme,
          dates and certificate status; email addresses and phone numbers are never shown there.
        </p>
      </LegalSection>

      <LegalSection id="storage" title="6. Where your data is stored">
        <p>
          Our application servers and database are located in Singapore. Our service providers may process data in
          other countries under their own safeguards.
        </p>
      </LegalSection>

      <LegalSection id="retention" title="7. How long we keep it">
        <p>
          We keep personal data only as long as we need it for the purposes above: for example while your account is
          active, while an application, training or engagement is in progress, and for as long as the law requires us to
          keep payment and employment records. You can ask us to delete your account at any time.
        </p>
      </LegalSection>

      <LegalSection id="security" title="8. How we protect it">
        <LegalList>
          <li>All traffic uses HTTPS.</li>
          <li>Passwords and sign-in codes are stored only as hashes; bank, PAN and UPI details are encrypted.</li>
          <li>Every password sign-in needs a fresh code sent to your email.</li>
          <li>Access to records is limited by role, and important staff actions are logged.</li>
        </LegalList>
      </LegalSection>

      <LegalSection id="your-rights" title="9. Your rights">
        <p>Under the Digital Personal Data Protection Act, 2023 you can:</p>
        <LegalList>
          <li>ask for a summary of the personal data we hold about you and how we use it;</li>
          <li>ask us to correct, complete or update it;</li>
          <li>ask us to erase it, unless the law requires us to keep it;</li>
          <li>withdraw your consent;</li>
          <li>nominate another person to exercise these rights if you die or become unable to; and</li>
          <li>raise a grievance with us.</li>
        </LegalList>
        <p>
          Write to {contactLink} from the email address on your account. We may ask you to confirm your identity before we
          act. If you are not satisfied with our answer to a grievance, you can complain to the Data Protection Board of
          India.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="10. Changes to this policy">
        <p>
          When we change this policy we update the date at the top of this page. If a change affects how we use data you
          have already given us, we will tell you by email or on the portal.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="11. Contact and grievances">
        <p>
          For privacy questions, requests and grievances, write to {contactLink}. See also our{" "}
          <Link href="/contact" className="font-medium text-primary hover:underline underline-offset-4">
            Contact page
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
