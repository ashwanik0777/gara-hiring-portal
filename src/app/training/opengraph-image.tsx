import { ImageResponse } from "next/og";
import { getSiteUrl } from "@/lib/site-url";
import { BrandCard, loadBrandLogo, OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE } from "../_og/brand-card";

export const alt = "Industrial Training at GARA Innovation";
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function TrainingOpengraphImage() {
  const logo = await loadBrandLogo();
  const host = new URL(getSiteUrl()).host;
  return new ImageResponse(
    (
      <BrandCard
        logo={logo}
        eyebrow="Industrial Training"
        title="Mentor-led training programmes"
        subtitle="Live batches, a final project and a verifiable certificate."
        footer={`${host}/training`}
      />
    ),
    size
  );
}
