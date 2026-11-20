import { COMPANY } from "@/config/site";
import { ORGANIZATION_NAME } from "@/lib/seo/json-ld";
import { absoluteUrl } from "@/lib/site-url";
import type { PublicTrainingProgram } from "./services/program-service";

/** schema.org Course for a programme page (fee and batches included; nothing invented). */
export function buildCourseJsonLd(program: PublicTrainingProgram): Record<string, unknown> {
  const url = absoluteUrl(`/training/${program.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: program.title,
    description: program.summary,
    url,
    provider: { "@type": "Organization", name: ORGANIZATION_NAME, sameAs: COMPANY.websiteUrl },
    offers: {
      "@type": "Offer",
      category: "Paid",
      price: (program.feePaise / 100).toFixed(2),
      priceCurrency: "INR",
      url,
    },
    timeRequired: `P${program.durationWeeks}W`,
    ...(program.batches.length > 0
      ? {
          hasCourseInstance: program.batches.map((batch) => ({
            "@type": "CourseInstance",
            name: batch.name,
            startDate: batch.startDate.toISOString().slice(0, 10),
            ...(batch.endDate ? { endDate: batch.endDate.toISOString().slice(0, 10) } : {}),
          })),
        }
      : {}),
  };
}
