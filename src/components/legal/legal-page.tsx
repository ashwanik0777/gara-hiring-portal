import * as React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Navbar } from "@/components/navigation/navbar";
import { Footer } from "@/components/navigation/footer";
import { JsonLd } from "@/components/seo/json-ld";
import { PAGE_GUTTER } from "@/components/layout/page-gutter";
import { COMPANY, LEGAL } from "@/config/site";
import { buildBreadcrumbJsonLd } from "@/lib/seo/json-ld";
import { absoluteUrl } from "@/lib/site-url";
import { POLICY_PAGES, type PolicyPagePath } from "./policy-pages";

/**
 * The "Draft — pending legal review" notice shows until LEGAL.reviewed is set, except on
 * production deployments (product owner's plan, 2026-11-19). Read at build time.
 */
export function isLegalDraftNoticeShown(): boolean {
  return !LEGAL.reviewed && process.env.VERCEL_ENV !== "production";
}

/** Title, description and canonical URL of a policy page (Open Graph comes from the root). */
export function buildLegalMetadata(title: string, description: string, path: PolicyPagePath): Metadata {
  return {
    title,
    description,
    alternates: { canonical: absoluteUrl(path) },
  };
}

interface LegalSectionProps {
  id: string;
  title: string;
  children: React.ReactNode;
}

const sideHeadingClass = "mb-3 text-xs font-bold uppercase tracking-wider text-foreground";
const sideLinkClass = "text-muted-foreground hover:text-foreground transition-colors";

/**
 * Full-width policy layout. Large screens: "On this page" and the other policies in a sticky
 * column on the left, the text in the middle and, on very wide screens, a contact card on
 * the right (keeping lines short enough to read). Phones: the text, then the related pages.
 */
export function LegalPage({
  title,
  // summary,
  path,
  showLastUpdated = true,
  children,
}: {
  title: string;
  // summary: string;
  path: PolicyPagePath;
  showLastUpdated?: boolean;
  children: React.ReactNode;
}) {
  const sections = React.Children.toArray(children)
    .filter(
      (child): child is React.ReactElement<LegalSectionProps> =>
        React.isValidElement(child) && child.type === LegalSection
    )
    .map((child) => ({ id: child.props.id, title: child.props.title }));
  const otherPages = POLICY_PAGES.filter((page) => page.href !== path);
  const showContactCard = path !== "/contact";

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />

      <main className="flex-1 py-10 md:py-14">
        <div className={PAGE_GUTTER}>
          <JsonLd
            data={buildBreadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: title, path },
            ])}
          />

          {/* {isLegalDraftNoticeShown() && (
            <p
              role="note"
              className="mb-6 rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:bg-amber-500/10 dark:text-amber-100"
            >
              Draft — pending legal review. This text may change before it is final.
            </p>
          )} */}

          <header className="mb-8 space-y-2 pb-6">
            <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-extrabold tracking-tight">
              {title}
            </h1>
            {/* <p className="text-sm leading-relaxed text-muted-foreground">{summary}</p> */}
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-12">
            <aside className="hidden lg:block lg:col-span-3">
              <div className="sticky top-24 space-y-8">
                {sections.length > 1 && (
                  <nav aria-label="On this page">
                    <p className={sideHeadingClass}>On this page</p>
                    <ul className="space-y-2 text-sm">
                      {sections.map((section) => (
                        <li key={section.id}>
                          <a href={`#${section.id}`} className={sideLinkClass}>
                            {section.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </nav>
                )}
                <nav aria-label="Other policies">
                  <p className={sideHeadingClass}>Policies</p>
                  <ul className="space-y-2 text-sm">
                    {otherPages.map((page) => (
                      <li key={page.href}>
                        <Link href={page.href} className={sideLinkClass}>
                          {page.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>
            </aside>

            <article className={`space-y-8 lg:col-span-9 ${showContactCard ? "2xl:col-span-6" : ""}`}>{children}</article>

            {showContactCard && (
              <aside className="hidden 2xl:block 2xl:col-span-3">
                <div className="sticky top-24 rounded-md border border-border/70 bg-card p-5 space-y-3 text-sm">
                  <p className="font-semibold text-foreground">Questions about this page?</p>
                  <p className="text-muted-foreground">
                    Write to{" "}
                    <a href={`mailto:${COMPANY.contactEmail}`} className="font-medium text-primary hover:underline underline-offset-4">
                      {COMPANY.contactEmail}
                    </a>
                    .
                  </p>
                  <Link href="/contact" className="inline-block font-medium text-primary hover:underline underline-offset-4">
                    All contact details
                  </Link>
                </div>
              </aside>
            )}
          </div>

          <nav aria-label="Related pages" className="mt-12 border-t border-border/70 pt-6 lg:hidden">
            <p className={sideHeadingClass}>Related pages</p>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {otherPages.map((page) => (
                <li key={page.href}>
                  <Link href={page.href} className="text-primary hover:underline underline-offset-4">
                    {page.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export function LegalSection({ id, title, children }: LegalSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 space-y-3">
      <h2 id={`${id}-title`} className="text-lg font-bold tracking-tight text-foreground">
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export function LegalList({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground/70">{children}</ul>;
}

/** "once", "twice"-style wording for counts that come from configuration. */
export function timesText(count: number): string {
  return count === 1 ? "once" : `${count} times`;
}

/** A labelled line such as "Email: …"; used for contact and company details. */
export function LegalFact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p>
      <span className="font-semibold text-foreground">{label}:</span> {children}
    </p>
  );
}
