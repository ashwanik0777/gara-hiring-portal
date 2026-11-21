import Link from "next/link";
import type { Metadata } from "next";
import { Award, Ban, CheckCircle, Megaphone, Users, Wallet } from "lucide-react";
import { Navbar } from "@/components/navigation/navbar";
import { Footer } from "@/components/navigation/footer";
import { PAGE_GUTTER } from "@/components/layout/page-gutter";
import { Card, CardContent } from "@/components/ui/card";
import { JsonLd } from "@/components/seo/json-ld";
import { buildBreadcrumbJsonLd, ORGANIZATION_NAME } from "@/lib/seo/json-ld";
import { absoluteUrl } from "@/lib/site-url";
import { CAMPUS_AMBASSADOR_POLICY } from "@/config/site";
import { formatInr } from "@/features/training/money";

const DESCRIPTION = `Represent ${ORGANIZATION_NAME} at your college as a Campus Ambassador: share Industrial Training with fellow students, earn a commission on paid enrollments made with your code once GARA approves your work, and get a verifiable certificate.`;

export const metadata: Metadata = {
  title: "Campus Ambassador Programme",
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/campus-ambassador") },
  openGraph: {
    type: "website",
    url: absoluteUrl("/campus-ambassador"),
    siteName: ORGANIZATION_NAME,
    title: `Campus Ambassador Programme — ${ORGANIZATION_NAME}`,
    description: DESCRIPTION,
  },
};

function Block({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="h-full">
      <CardContent className="space-y-3 p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
          {icon}
          {title}
        </h2>
        {children}
      </CardContent>
    </Card>
  );
}

const linkClass = "font-medium text-primary hover:underline underline-offset-4";

export default function CampusAmbassadorPage() {
  const commission = formatInr(CAMPUS_AMBASSADOR_POLICY.commissionPaise);
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />
      <main className="flex-1 py-12 md:py-16">
        <div className={`${PAGE_GUTTER} space-y-10`}>
          <JsonLd
            data={buildBreadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Campus Ambassador", path: "/campus-ambassador" },
            ])}
          />
          <header className="space-y-4 text-center">
            <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight">
              Campus Ambassador Programme
            </h1>
           
            <Link
              href="/candidate/ambassador"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-xs hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Apply to become an ambassador
            </Link>
          </header>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            <Block title="What you do" icon={<Megaphone className="h-5 w-5 text-primary" />}>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Share your personal referral link, QR code and the official material with students at your college.</li>
                <li>Answer questions honestly and point students to the programme pages for details.</li>
                <li>Track clicks, sign-ups and paid enrollments in your ambassador dashboard.</li>
              </ul>
            </Block>
            <Block title="What you get" icon={<Award className="h-5 w-5 text-primary" />}>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>A commission of {commission} for a paid Industrial Training enrollment made with your code, once GARA reviews and approves your work.</li>
                <li>A verifiable Campus Ambassador certificate and a letter of recommendation.</li>
                <li>Top performers may be offered a stipend internship.</li>
              </ul>
            </Block>
            <Block title="How you are paid" icon={<Wallet className="h-5 w-5 text-primary" />}>
              <p className="text-sm text-muted-foreground">
                A commission is recorded when the student&apos;s payment is confirmed. Once that batch&apos;s refund window has
                closed (24 hours after the first live class), GARA reviews your work and decides whether to approve it; GARA may
                decline a commission at its discretion. If the student is refunded, the commission is reversed. Approved
                commissions are paid to the UPI ID in your dashboard; tax is deducted where the law requires it.
              </p>
            </Block>
            <Block title="Roles" icon={<Users className="h-5 w-5 text-primary" />}>
              <p className="text-sm text-muted-foreground">
                Every college can have several Associates and one Lead, who coordinates them. The first{" "}
                {CAMPUS_AMBASSADOR_POLICY.trialDays} days after approval are a trial period.
              </p>
            </Block>
            <Block title="Rules" icon={<Ban className="h-5 w-5 text-primary" />}>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>No false promises, such as a &quot;placement guarantee&quot;.</li>
                <li>Never collect money from anyone: students pay only on this website.</li>
                <li>Use only official material; you cannot use your own code for yourself.</li>
                <li>Breaking the rules can end the role.</li>
              </ul>
            </Block>
            <Block title="Before you apply" icon={<CheckCircle className="h-5 w-5 text-primary" />}>
              <p className="text-sm text-muted-foreground">
                Read the{" "}
                <Link href="/terms" className={linkClass}>
                  Terms of Service
                </Link>{" "}
                and the{" "}
                <Link href="/privacy" className={linkClass}>
                  Privacy Policy
                </Link>
                . Internships at {ORGANIZATION_NAME} are always free and separate from this programme; see{" "}
                <Link href="/training" className={linkClass}>
                  Industrial Training
                </Link>{" "}
                for the programmes you will share.
              </p>
            </Block>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
