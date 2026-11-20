import { Download } from "lucide-react";

/** Download links for administrator CSV exports (plain links: the browser saves the file). */
export function ExportLinks({ items }: { items: Array<{ dataset: string; label: string }> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <a
          key={item.dataset}
          href={`/api/admin/exports/${item.dataset}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" /> {item.label}
        </a>
      ))}
    </div>
  );
}
