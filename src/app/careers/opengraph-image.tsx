import { ImageResponse } from "next/og";
import { getSiteUrl } from "@/lib/site-url";
import { BrandCard, loadBrandLogo, OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE } from "../_og/brand-card";

export const alt = "Open internships and full-time roles at GARA Innovation";
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

/**
 * Link-preview image of the careers page (the page sets its own Open Graph fields, which
 * replace the root ones, so the image is provided at this level). Openings have their own.
 */
export default async function CareersOpengraphImage() {
  const logo = await loadBrandLogo();
  return new ImageResponse(
    (
      <BrandCard
        logo={logo}
        eyebrow="Now hiring"
        title="Open internships and full-time roles"
        subtitle="Browse current openings and apply online in a few minutes."
        footer={`${new URL(getSiteUrl()).host}/careers`}
      />
    ),
    size
  );
}
