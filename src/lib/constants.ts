export const APP_EMAIL = "garaworking007@gmail.com";

/**
 * Validates an optional WhatsApp click-to-chat link. Only `https://wa.me/<number>`
 * URLs are accepted; anything else (including an unset value) yields null so the
 * WhatsApp link is hidden instead of pointing at a placeholder number.
 */
export function parseWhatsAppUrl(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("https://wa.me/")) return null;
  try {
    const url = new URL(trimmed);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "wa.me" ||
      url.username ||
      url.password ||
      url.port ||
      !/^\/\d{6,15}\/?$/.test(url.pathname)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

// Must be referenced literally so Next.js inlines the public value at build time.
export const WHATSAPP_URL: string | null = parseWhatsAppUrl(
  process.env.NEXT_PUBLIC_WHATSAPP_URL
);

export const SOCIAL_LINKS = {
  /** `null` when NEXT_PUBLIC_WHATSAPP_URL is unset or invalid (link hidden). */
  whatsapp: WHATSAPP_URL,
  linkedin: "https://www.linkedin.com/company/gara-innovation",
  instagram: "https://www.instagram.com/gara_innovations",
  twitter: "https://x.com/garainnovations",
  youtube: "https://www.youtube.com/@garainnovations",
};
