import { Download, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocumentLinkView } from "../document-links";

const actionClass =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 h-8 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/**
 * "Open resume" for a candidate-provided share link. Always a plain external link opened in a
 * new tab without referrer or opener; the document is never embedded in the page.
 */
export function OpenResumeLink({
  link,
  className,
}: {
  link: DocumentLinkView;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-1", className)}>
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        referrerPolicy="no-referrer"
        className={actionClass}
      >
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Open resume
        <span className="sr-only">(external link on {link.hostname}, opens in a new tab)</span>
      </a>
      <span className="text-[11px] text-muted-foreground" aria-hidden="true">
        External link · {link.hostname}
      </span>
    </div>
  );
}

/**
 * Resume actions for the staff application header: the external share link (link mode),
 * the stored file download (local mode), or an honest "not provided" note.
 */
export function StaffResumeActions({
  link,
  downloadUrl,
}: {
  link: DocumentLinkView | null;
  /** Download route for a stored file; null when no file is stored. */
  downloadUrl: string | null;
}) {
  if (!link && !downloadUrl) {
    return <span className="text-xs text-muted-foreground">No resume provided</span>;
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      {link && <OpenResumeLink link={link} />}
      {downloadUrl && (
        <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className={actionClass}>
          <Download className="h-4 w-4" aria-hidden="true" /> Download Resume
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
    </div>
  );
}
