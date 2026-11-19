import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cacheLife } from "next/cache";

/*
 * Shared Open Graph card (1200×630) used by the opengraph-image routes. Link previews on
 * WhatsApp, LinkedIn, Slack and X read only the HTML <head>; this image is what they show.
 * Rendered by next/og (Satori): flexbox layout and inline styles only.
 */

export const OG_IMAGE_SIZE = { width: 1200, height: 630 };
export const OG_IMAGE_CONTENT_TYPE = "image/png";

const BRAND_BLUE = "#1d4ed8";
const INK = "#0f172a";
const MUTED = "#475569";

/**
 * The brand logo as a data URL; null when the file is unavailable. Cached, so the image
 * routes count as static (generated once at build time instead of on every crawler request).
 */
export async function loadBrandLogo(): Promise<string | null> {
  "use cache";
  cacheLife("max");
  try {
    const file = await readFile(join(process.cwd(), "public/brand/gara-logo.png"));
    return `data:image/png;base64,${file.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Shortens text for the card so long titles never overflow. */
export function clampText(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export function BrandCard({
  logo,
  eyebrow,
  title,
  subtitle,
  footer,
}: {
  logo: string | null;
  eyebrow: string;
  title: string;
  subtitle: string;
  footer: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#ffffff",
        borderTop: `14px solid ${BRAND_BLUE}`,
        padding: "56px 72px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img> only.
          <img src={logo} width={96} height={96} alt="" style={{ borderRadius: 8, marginRight: 24 }} />
        )}
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: INK }}>GARA Innovation</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>
        <div
          style={{
            display: "flex",
            fontSize: 26,
            fontWeight: 600,
            color: BRAND_BLUE,
            textTransform: "uppercase",
            letterSpacing: 2,
            marginBottom: 18,
          }}
        >
          {eyebrow}
        </div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 800, color: INK, lineHeight: 1.1 }}>{title}</div>
        <div style={{ display: "flex", fontSize: 30, color: MUTED, marginTop: 22, lineHeight: 1.35 }}>{subtitle}</div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: "2px solid #e2e8f0",
          paddingTop: 24,
          fontSize: 24,
          color: MUTED,
        }}
      >
        <div style={{ display: "flex" }}>{footer}</div>
        <div style={{ display: "flex", color: BRAND_BLUE, fontWeight: 700 }}>Apply online</div>
      </div>
    </div>
  );
}
