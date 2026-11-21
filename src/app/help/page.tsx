import { Suspense } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  ClipboardList,
  GraduationCap,
  LifeBuoy,
  Lock,
  Mail,
  MessageSquare,
  ShieldCheck,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { Navbar } from "@/components/navigation/navbar";
import { Footer } from "@/components/navigation/footer";
import { getCurrentUser } from "@/lib/auth/guards";
import { chatbotService } from "@/features/chatbot/services/chatbot-service";
import { PortalChatbotWidget } from "@/features/chatbot/components/portal-chatbot-widget";
import { ChatPanelSkeleton } from "@/components/feedback/page-skeletons";
import { PAGE_GUTTER } from "@/components/layout/page-gutter";
import { PageHero, SectionHeading } from "@/components/marketing/page-sections";
import { COMPANY } from "@/config/site";

export const metadata = {
  title: "Help Center, Approved FAQs & Portal Assistant",
  description:
    "Official GARA Innovation Portal Help Center, versioned FAQ knowledge base, and scoped portal status assistant.",
};

export const instant = false;

/*
 * The FAQ catalogue is static, so the page shell prerenders. Only the two parts that depend
 * on the signed-in user (navbar account menu, assistant personalisation) read the session,
 * each behind its own Suspense boundary; getCurrentUser() is memoised per request.
 */

async function SessionNavbar() {
  const user = await getCurrentUser();
  return <Navbar user={user} />;
}

async function HelpAssistant() {
  const user = await getCurrentUser();
  return <PortalChatbotWidget isAuthenticated={Boolean(user)} userName={user?.name} />;
}

/** FAQ categories as students read them (unknown ones fall back to the code in words). */
const CATEGORY_LABELS: Record<string, string> = {
  ACCOUNT_AND_ACCESS: "Account & Access",
  APPLICATION_PROCESS: "Applications",
  SUPERVISED_EVALUATION: "Evaluation",
  INTERNSHIP_ONBOARDING: "Onboarding",
  PROGRESS_AND_TASKS: "Tasks & Progress",
  CERTIFICATES: "Certificates",
  FULL_TIME_AND_HRMS: "Full-time Roles",
  INDUSTRIAL_TRAINING: "Industrial Training",
  CAMPUS_AMBASSADOR: "Campus Ambassador",
};

/** Link text for an FAQ's related page. */
const PATH_LABELS: Record<string, string> = {
  "/register": "Create an account",
  "/careers": "Browse openings",
  "/candidate/applications": "My applications",
  "/intern/evaluation": "My evaluation",
  "/intern/workspace": "Intern workspace",
  "/verify": "Verify a certificate",
  "/training": "Industrial Training",
  "/candidate/training": "My training",
  "/refund-policy": "Refund & Cancellation Policy",
  "/campus-ambassador": "Campus Ambassador Programme",
  "/candidate/ambassador": "Ambassador dashboard",
};

function categoryLabel(category: string): string {
  if (CATEGORY_LABELS[category]) return CATEGORY_LABELS[category];
  const text = category.replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const categoryAnchor = (category: string) => `faq-${category.toLowerCase().replace(/_/g, "-")}`;

const QUICK_LINKS: Array<{ href: string; label: string; icon: LucideIcon; tone: string }> = [
  { href: "/candidate/applications", label: "Track my application", icon: ClipboardList, tone: "bg-primary/10 text-primary" },
  { href: "/verify", label: "Verify a certificate", icon: ShieldCheck, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  { href: "/training", label: "Industrial Training", icon: GraduationCap, tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  { href: "/contact", label: "Contact us", icon: Mail, tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
];

const PRIVACY_POINTS: Array<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: UserCheck, title: "Only your own status", text: "Status answers need you to sign in and show only your own records." },
  { icon: Lock, title: "Private data stays private", text: "Resumes, documents, payroll and internal evaluation notes are never sent to external AI services." },
  { icon: BookOpen, title: "Approved answers", text: "Answers are based on GARA's approved FAQs." },
];

export default function HelpCenterPage() {
  const faqCatalog = chatbotService.getApprovedFaqs();
  const categories = [...new Set(faqCatalog.entries.map((entry) => entry.category))];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* The guest navbar paints with the shell; the account menu streams in for signed-in users. */}
      <Suspense fallback={<Navbar />}>
        <SessionNavbar />
      </Suspense>

      <main className="flex flex-1 flex-col">
        <PageHero
          eyebrow={{ icon: LifeBuoy, label: "Help Center" }}
          title={
            <>
              GARA Portal <span className="text-primary">Help Center</span> &amp; Assistant
            </>
          }
        >
          <nav aria-label="Quick help" className="mx-auto grid max-w-4xl grid-cols-2 gap-3 pt-2 lg:grid-cols-4">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group flex flex-col items-center gap-3 rounded-2xl border border-border/70 bg-card p-5 text-sm font-semibold text-foreground shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span aria-hidden="true" className={`flex h-11 w-11 items-center justify-center rounded-xl ${link.tone}`}>
                  <link.icon className="h-5 w-5" />
                </span>
                {link.label}
              </Link>
            ))}
          </nav>
        </PageHero>

        <section className="border-t border-border/60 bg-muted/20 py-8 dark:bg-muted/5 lg:py-10">
          <div className={`${PAGE_GUTTER} grid grid-cols-1 gap-6 lg:grid-cols-3`}>
            <section aria-label="Interactive Portal Assistant" className="lg:col-span-2">
              <Suspense fallback={<ChatPanelSkeleton label="Loading the portal assistant" />}>
                <HelpAssistant />
              </Suspense>
            </section>
            <aside className="space-y-6">
              <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs">
                <h2 className="flex items-center gap-2.5 text-base font-semibold text-foreground">
                  <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  Your privacy
                </h2>
                <ul className="mt-5 space-y-4">
                  {PRIVACY_POINTS.map((point) => (
                    <li key={point.title} className="flex gap-3">
                      <point.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span>
                        <span className="block text-sm font-medium text-foreground">{point.title}</span>
                        <span className="block text-sm leading-relaxed text-muted-foreground">{point.text}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
                <h2 className="flex items-center gap-2.5 text-base font-semibold text-foreground">
                  <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <MessageSquare className="h-4 w-4" />
                  </span>
                  Still need help?
                </h2>
                <a
                  href={`mailto:${COMPANY.contactEmail}`}
                  className="mt-4 flex items-center gap-2 break-all text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {COMPANY.contactEmail}
                </a>
                <Link href="/contact" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary">
                  Contact page <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </aside>
          </div>
        </section>

        <section aria-labelledby="faq-heading" className="py-8 lg:py-10">
          <div className={PAGE_GUTTER}>
            <SectionHeading id="faq-heading" eyebrow={{ icon: BookOpen, label: "FAQs" }} title="Frequently Asked Questions" />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
              <nav aria-label="FAQ topics" className="lg:sticky lg:top-24 lg:self-start">
                <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
                  {categories.map((category) => (
                    <li key={category}>
                      <a
                        href={`#${categoryAnchor(category)}`}
                        className="inline-flex rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground lg:flex lg:rounded-lg lg:border-transparent lg:bg-transparent lg:px-3 lg:py-2 lg:text-sm lg:hover:bg-muted"
                      >
                        {categoryLabel(category)}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="space-y-7 lg:col-span-3">
                {categories.map((category) => (
                  <section key={category} id={categoryAnchor(category)} aria-labelledby={`${categoryAnchor(category)}-title`} className="scroll-mt-24 space-y-3">
                    <h3 id={`${categoryAnchor(category)}-title`} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {categoryLabel(category)}
                    </h3>
                    {faqCatalog.entries
                      .filter((entry) => entry.category === category)
                      .map((entry) => (
                        <details
                          key={entry.id}
                          className="group rounded-2xl border border-border/70 bg-card shadow-xs transition-colors open:border-primary/30 open:shadow-sm"
                        >
                          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-2xl p-5 text-left text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-base [&::-webkit-details-marker]:hidden">
                            <span>{entry.question}</span>
                            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                          </summary>
                          <div className="space-y-3 px-5 pb-5 text-sm leading-relaxed text-muted-foreground">
                            <p>{entry.answer}</p>
                            {entry.relatedPath && (
                              <Link href={entry.relatedPath} className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline">
                                {PATH_LABELS[entry.relatedPath] ?? "Open page"} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                              </Link>
                            )}
                          </div>
                        </details>
                      ))}
                  </section>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
