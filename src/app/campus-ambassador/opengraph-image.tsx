import { ImageResponse } from "next/og";
import { getSiteUrl } from "@/lib/site-url";
import { BrandCard, loadBrandLogo, OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE } from "../_og/brand-card";

export const alt = "Campus Ambassador programme at GARA Innovation";
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function AmbassadorOpengraphImage() {
  const logo = await loadBrandLogo();
  const host = new URL(getSiteUrl()).host;
  return new ImageResponse(
    (
      <BrandCard
        logo={logo}
        eyebrow="Campus Ambassador"
        title="Become a GARA Campus Ambassador"
        subtitle="Represent GARA at your college and earn per paid enrollment."
        footer={`${host}/campus-ambassador`}
      />
    ),
    size
  );
}
