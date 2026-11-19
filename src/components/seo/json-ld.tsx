import { serializeJsonLd } from "@/lib/seo/json-ld";

/**
 * Structured data for search engines. The only place that writes raw script content: the
 * value is serialized with every `<`, `>` and `&` escaped, so no text can break out of it.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
