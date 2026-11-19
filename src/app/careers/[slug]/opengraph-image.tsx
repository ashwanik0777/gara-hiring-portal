import { ImageResponse } from "next/og";
import { getPublicOpeningBySlug } from "@/features/openings/services/opening-service";
import { getSiteUrl } from "@/lib/site-url";
import { BrandCard, clampText, loadBrandLogo, OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE } from "../../_og/brand-card";

export const alt = "Open position at GARA Innovation";
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

/**
 * Link-preview image for one opening: its title, type and location, so a job shared on
 * WhatsApp or LinkedIn is recognisable at a glance. Uses the cached public opening read;
 * unknown or unpublished openings fall back to the generic careers card.
 */
export default async function OpeningOpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [logo, opening] = await Promise.all([
    loadBrandLogo(),
    getPublicOpeningBySlug(slug).catch(() => null),
  ]);
  const host = new URL(getSiteUrl()).host;

  if (!opening) {
    return new ImageResponse(
      (
        <BrandCard
          logo={logo}
          eyebrow="Careers & internships"
          title="Open roles at GARA Innovation"
          subtitle="Internship cohorts and full-time positions."
          footer={`${host}/careers`}
        />
      ),
      size
    );
  }

  const kind = opening.type === "INTERNSHIP" ? "Internship" : "Full-time role";
  const details = [opening.department, opening.location, opening.workplaceType?.toLowerCase()]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" · ");
  return new ImageResponse(
    (
      <BrandCard
        logo={logo}
        eyebrow={kind}
        title={clampText(opening.title, 70)}
        subtitle={clampText(details || "GARA Innovation", 90)}
        footer={`${host}/careers/${opening.slug}`}
      />
    ),
    size
  );
}
