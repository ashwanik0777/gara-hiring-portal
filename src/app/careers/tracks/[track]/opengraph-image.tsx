import { ImageResponse } from "next/og";
import { getActiveTrackBySlug } from "@/features/openings/services/track-service";
import { getSiteUrl } from "@/lib/site-url";
import { BrandCard, clampText, loadBrandLogo, OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE } from "../../../_og/brand-card";

export const alt = "Career track at GARA Innovation";
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

/** Link-preview image of a track page (shared on WhatsApp by Campus Ambassadors, for example). */
export default async function TrackOpengraphImage({ params }: { params: Promise<{ track: string }> }) {
  const { track: slug } = await params;
  const [logo, track] = await Promise.all([loadBrandLogo(), getActiveTrackBySlug(slug).catch(() => null)]);
  const host = new URL(getSiteUrl()).host;

  return new ImageResponse(
    (
      <BrandCard
        logo={logo}
        eyebrow="Career track"
        title={clampText(track ? `${track.name} internships & jobs` : "Open roles at GARA Innovation", 70)}
        subtitle="Internship cohorts and full-time positions."
        footer={`${host}/careers${track ? `/tracks/${track.slug}` : ""}`}
      />
    ),
    size
  );
}
