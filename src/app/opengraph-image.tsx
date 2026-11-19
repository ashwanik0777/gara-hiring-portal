import { ImageResponse } from "next/og";
import { getSiteUrl } from "@/lib/site-url";
import { BrandCard, loadBrandLogo, OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE } from "./_og/brand-card";

export const alt = "GARA Innovation — internships, careers and verified credentials";
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

/** Default link-preview image for every page that does not define its own. */
export default async function OpengraphImage() {
  const logo = await loadBrandLogo();
  return new ImageResponse(
    (
      <BrandCard
        logo={logo}
        eyebrow="Careers & internships"
        title="Start your career with GARA Innovation"
        subtitle="Structured internship cohorts, full-time roles and verifiable certificates."
        footer={new URL(getSiteUrl()).host}
      />
    ),
    size
  );
}
