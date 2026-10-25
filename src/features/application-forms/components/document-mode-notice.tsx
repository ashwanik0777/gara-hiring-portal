import { Link2, UploadCloud } from "lucide-react";
import type { DocumentStorageMode } from "../types";

/**
 * Explains to staff how document fields are collected from candidates. Has no hooks or
 * server-only imports, so it renders in both server and client components.
 */
export function DocumentModeNotice({ documentMode }: { documentMode: DocumentStorageMode }) {
  if (documentMode === "link") {
    return (
      <div
        role="note"
        className="rounded-xl border border-border bg-muted/40 p-4 flex items-start gap-3 text-xs leading-relaxed"
      >
        <Link2 className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="font-semibold text-foreground">Document fields collect a share link</p>
          <p className="text-muted-foreground mt-0.5">
            Candidates paste an https link (Google Drive, OneDrive or Dropbox) to their resume
            instead of uploading a file. No files are stored. File type and size limits apply only
            when uploads are enabled on your own storage server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="note"
      className="rounded-xl border border-border bg-muted/40 p-4 flex items-start gap-3 text-xs leading-relaxed"
    >
      <UploadCloud className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
      <div>
        <p className="font-semibold text-foreground">Document fields collect a PDF upload</p>
        <p className="text-muted-foreground mt-0.5">
          Candidates upload one PDF document (maximum 5MB), kept in private storage.
        </p>
      </div>
    </div>
  );
}
