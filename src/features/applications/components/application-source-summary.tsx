import { Megaphone } from "lucide-react";
import { describeApplicationSource } from "../source-tracking";

interface ApplicationSourceSummaryProps {
  /** Stored source code; null for applications submitted before source tracking existed. */
  source: string | null;
  /** Plain-text campaign detail (utm values, referrer host) recorded with the source. */
  sourceDetail: string | null;
}

/**
 * Where the candidate came from, shown in the staff application header. Read-only; legacy
 * rows read "Not recorded" rather than guessing a channel.
 */
export function ApplicationSourceSummary({ source, sourceDetail }: ApplicationSourceSummaryProps) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Megaphone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">
        Source: <span className="text-foreground">{describeApplicationSource(source)}</span>
        {sourceDetail ? (
          <span className="font-mono text-[11px] text-muted-foreground/80"> · {sourceDetail}</span>
        ) : null}
      </span>
    </span>
  );
}
