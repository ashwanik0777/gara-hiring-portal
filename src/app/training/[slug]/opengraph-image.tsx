import { ImageResponse } from "next/og";
import { getSiteUrl } from "@/lib/site-url";
import { getPublishedProgramBySlug } from "@/features/training/services/program-service";
import { formatInr } from "@/features/training/money";
import { BrandCard, clampText, loadBrandLogo, OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE } from "../../_og/brand-card";

export const alt = "Industrial Training programme at GARA Innovation";
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

/** Link preview of a programme: title, duration and fee (shared on WhatsApp by ambassadors). */
export default async function ProgrammeOpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [logo, program] = await Promise.all([loadBrandLogo(), getPublishedProgramBySlug(slug).catch(() => null)]);
  const host = new URL(getSiteUrl()).host;
  return new ImageResponse(
    (
      <BrandCard
        logo={logo}
        eyebrow="Industrial Training"
        title={clampText(program?.title ?? "Training programmes at GARA Innovation", 70)}
        subtitle={program ? `${program.durationWeeks} weeks · ${formatInr(program.feePaise)} · certificate included` : "Live batches and a verifiable certificate."}
        footer={`${host}/training${program ? `/${program.slug}` : ""}`}
      />
    ),
    size
  );
}
