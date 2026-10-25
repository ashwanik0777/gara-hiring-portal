import { isSafeHttpsUrl } from "@/features/application-forms/schemas";

/** An external document share link prepared for display. */
export interface DocumentLinkView {
  url: string;
  /** Host name shown next to the link so readers know where it leads. */
  hostname: string;
}

/**
 * Prepares a stored share link for rendering. Returns null for empty values and for anything
 * that is not a safe https URL, so a tampered value is never rendered as a link.
 */
export function describeDocumentLink(value: string | null | undefined): DocumentLinkView | null {
  if (!value || !isSafeHttpsUrl(value)) {
    return null;
  }
  const parsed = new URL(value);
  return { url: parsed.href, hostname: parsed.hostname.replace(/^www\./, "") };
}
