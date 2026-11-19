import Link from "next/link";
import { LegalPage, LegalSection, buildLegalMetadata } from "@/components/legal/legal-page";

export const metadata = buildLegalMetadata(
  "Cookie Policy",
  "The cookies and browser storage the GARA Innovation careers portal uses: sign-in, security and a first-party visitor count. No advertising or third-party tracking cookies.",
  "/cookie-policy"
);

interface StorageItem {
  name: string;
  purpose: string;
  duration: string;
  kind: string;
}

/*
 * Kept in step with the code: Better Auth cookies (src/lib/auth/auth.ts; "__Secure-" prefix on
 * HTTPS), the visitor cookie (src/app/api/analytics/visitors/route.ts) and browser storage keys.
 */
const COOKIES: StorageItem[] = [
  {
    name: "better-auth.session_token",
    purpose: "Keeps you signed in.",
    duration: "7 days, or until you close the browser if you did not tick “Remember me”",
    kind: "Essential",
  },
  {
    name: "better-auth.dont_remember",
    purpose: "Remembers that you chose not to stay signed in.",
    duration: "Until you close the browser",
    kind: "Essential",
  },
  {
    name: "better-auth.two_factor",
    purpose: "Links your sign-in to the code we email you.",
    duration: "10 minutes",
    kind: "Essential",
  },
  {
    name: "better-auth.state",
    purpose: "Protects Google sign-in against forged requests (only when you use Google).",
    duration: "5 minutes",
    kind: "Essential",
  },
  {
    name: "gara_vid",
    purpose: "A random ID used to count distinct visitors. It builds no profile and is not shared.",
    duration: "1 year",
    kind: "First-party analytics",
  },
];

const BROWSER_STORAGE: StorageItem[] = [
  { name: "gara_theme", purpose: "Your light or dark theme choice.", duration: "Until you clear it", kind: "Preference" },
  {
    name: "gara_visit_tracked",
    purpose: "Stops the same visit from being counted twice.",
    duration: "Until you close the tab",
    kind: "First-party analytics",
  },
  {
    name: "Dashboard notices",
    purpose: "Which notifications you have read and which banners you have closed.",
    duration: "Until you clear it",
    kind: "Preference",
  },
];

function StorageTable({ caption, items }: { caption: string; items: StorageItem[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border/70">
      <table className="w-full min-w-[560px] text-left text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted/50 text-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">Name</th>
            <th scope="col" className="px-3 py-2 font-semibold">Purpose</th>
            <th scope="col" className="px-3 py-2 font-semibold">Duration</th>
            <th scope="col" className="px-3 py-2 font-semibold">Type</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {items.map((item) => (
            <tr key={item.name}>
              <td className="px-3 py-2 font-mono text-[11px] text-foreground">{item.name}</td>
              <td className="px-3 py-2">{item.purpose}</td>
              <td className="px-3 py-2">{item.duration}</td>
              <td className="px-3 py-2">{item.kind}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CookiePolicyPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      path="/cookie-policy"
      summary="Cookies are small files a website stores in your browser. This page lists every cookie and browser storage item this portal uses."
    >
      <LegalSection id="summary" title="1. In short">
        <p>
          We use cookies to sign you in, to keep sign-in secure and to count visitors. All of them are our own. We use no
          advertising cookies, no social media trackers and no third-party analytics.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="2. Cookies">
        <p>
          On secure (HTTPS) connections the sign-in cookies start with <code className="font-mono">__Secure-</code>.
        </p>
        <StorageTable caption="Cookies used by this portal" items={COOKIES} />
      </LegalSection>

      <LegalSection id="browser-storage" title="3. Other browser storage">
        <p>These items are kept in your browser&apos;s local or session storage and are never sent to us automatically.</p>
        <StorageTable caption="Browser storage used by this portal" items={BROWSER_STORAGE} />
      </LegalSection>

      <LegalSection id="control" title="4. Your choices">
        <p>
          You can delete or block cookies in your browser settings. If you block the essential cookies, you will not be
          able to sign in. Blocking <code className="font-mono">gara_vid</code> only stops you from being counted as a
          visitor.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="5. Changes">
        <p>
          We update this page before we add a new cookie, for example the referral cookie of the Campus Ambassador
          programme. How we handle personal data is explained in the{" "}
          <Link href="/privacy" className="font-medium text-primary hover:underline underline-offset-4">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
