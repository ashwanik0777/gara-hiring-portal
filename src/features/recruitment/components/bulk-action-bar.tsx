"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Eye, Layers, Mail, XCircle } from "lucide-react";
import { ApplicationStatus } from "@/types/enums";
import { Button } from "@/components/ui/button";
import { APPLICATION_STAGE_LABELS } from "@/features/applications/stage-labels";
import { bulkTransitionApplicationsAction, previewBulkStageEmailAction } from "../bulk-actions";
import type { BulkTransitionSummary } from "../services/bulk-actions-service";
import { useBulkSelection, type BulkSelectableApplication } from "./bulk-selection";

const STAGE_ORDER = Object.values(ApplicationStatus);
const MAX_MESSAGE_LENGTH = 2000;
const NETWORK_ERROR = "We couldn't reach the server. Check your connection and try again.";

function pluralApplications(count: number): string {
  return `${count} application${count === 1 ? "" : "s"}`;
}

/** Stages (other than Rejected, which has its own button) every selected application can move to. */
export function commonMoveTargets(items: BulkSelectableApplication[]): ApplicationStatus[] {
  if (items.length === 0) return [];
  return STAGE_ORDER.filter(
    (stage) =>
      stage !== ApplicationStatus.REJECTED && items.every((item) => item.manualTargets.includes(stage))
  );
}

/**
 * Sticky bar shown while applications are selected: "Move to stage" offers only stages
 * valid for every selected application; "Reject" applies to all and skips the ones that
 * can't be rejected. The server re-checks each application.
 */
export function BulkActionBar() {
  const { selectedItems, clear } = useBulkSelection();
  const router = useRouter();
  const selectId = useId();
  const moveTargets = useMemo(() => commonMoveTargets(selectedItems), [selectedItems]);
  const [chosenTarget, setChosenTarget] = useState<ApplicationStatus | "">("");
  const [dialogTarget, setDialogTarget] = useState<ApplicationStatus | null>(null);
  // Snapshot of the selection when the dialog opened, so the count never changes under it.
  const [dialogItems, setDialogItems] = useState<BulkSelectableApplication[]>([]);

  const moveTarget =
    chosenTarget && moveTargets.includes(chosenTarget) ? chosenTarget : moveTargets[0] ?? "";

  if (selectedItems.length === 0 && dialogTarget === null) {
    return null;
  }

  const openDialog = (toStatus: ApplicationStatus) => {
    setDialogItems(selectedItems);
    setDialogTarget(toStatus);
  };

  return (
    <>
      <div
        role="region"
        aria-label="Bulk actions for selected applications"
        className="sticky bottom-4 z-30 rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur-xs"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <p className="flex items-center gap-2 text-xs font-semibold text-foreground" aria-live="polite">
            <Layers className="h-4 w-4 text-primary" aria-hidden="true" />
            {pluralApplications(selectedItems.length)} selected
          </p>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {moveTargets.length > 0 ? (
              <div className="flex items-center gap-2">
                <label htmlFor={selectId} className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                  Move to stage
                </label>
                <select
                  id={selectId}
                  value={moveTarget}
                  onChange={(event) => setChosenTarget(event.target.value as ApplicationStatus)}
                  className="h-8 rounded-xl border border-input bg-card px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {moveTargets.map((stage) => (
                    <option key={stage} value={stage}>
                      {APPLICATION_STAGE_LABELS[stage]}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => moveTarget && openDialog(moveTarget)}
                  disabled={!moveTarget}
                >
                  Move
                </Button>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground max-w-xs">
                The selected applications have no next stage in common. Select applications in the same stage to move them together.
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => openDialog(ApplicationStatus.REJECTED)}
              >
                <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                Reject
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={clear}>
                Clear
              </Button>
            </div>
          </div>
        </div>
      </div>

      {dialogTarget && (
        <BulkConfirmDialog
          toStatus={dialogTarget}
          items={dialogItems}
          onClose={(changed) => {
            setDialogTarget(null);
            setDialogItems([]);
            if (changed) {
              clear();
              router.refresh();
            }
          }}
        />
      )}
    </>
  );
}

interface BulkConfirmDialogProps {
  toStatus: ApplicationStatus;
  items: BulkSelectableApplication[];
  /** `changed` is true when at least one application was updated. */
  onClose: (changed: boolean) => void;
}

function BulkConfirmDialog({ toStatus, items, onClose }: BulkConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const notesId = useId();
  const messageId = useId();
  const emailToggleId = useId();

  const [internalNotes, setInternalNotes] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{ subject: string; text: string } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BulkTransitionSummary | null>(null);

  const isReject = toStatus === ApplicationStatus.REJECTED;
  const stageLabel = APPLICATION_STAGE_LABELS[toStatus];
  const countLabel = pluralApplications(items.length);
  const changed = (summary?.moved ?? 0) > 0;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
  }, []);

  const close = () => {
    if (isSubmitting) return;
    onClose(changed);
  };

  const handlePreview = async () => {
    setPreviewError(null);
    setPreview(null);
    if (!message.trim()) {
      setPreviewError("Write the message first, then preview it.");
      return;
    }
    setIsPreviewing(true);
    try {
      const result = await previewBulkStageEmailAction({
        applicationId: items[0]?.id,
        toStatus,
        candidateMessage: message,
      });
      if (result.success) setPreview(result.data);
      else setPreviewError(result.error);
    } catch {
      setPreviewError(NETWORK_ERROR);
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (sendEmail && !message.trim()) {
      setError("Write the message to send to candidates, or turn off the email.");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await bulkTransitionApplicationsAction({
        applicationIds: items.map((item) => item.id),
        toStatus,
        sendEmail,
        candidateMessage: sendEmail ? message : null,
        internalNotes: internalNotes || null,
      });
      if (result.success) setSummary(result.data);
      else setError(result.error);
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  };

  const skippedItems = summary?.items.filter((item) => item.outcome === "SKIPPED") ?? [];

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border border-border bg-card p-0 text-foreground shadow-lg backdrop:bg-black/60"
    >
      <div className="space-y-4 p-5">
        <div className="space-y-1">
          <h2 id={titleId} className="text-base font-bold text-foreground">
            {summary
              ? "Bulk update finished"
              : isReject
                ? `Reject ${countLabel}?`
                : `Move ${countLabel} to ${stageLabel}?`}
          </h2>
          <p id={descriptionId} className="text-xs text-muted-foreground">
            {summary
              ? `${summary.moved} of ${pluralApplications(summary.requested)} updated.`
              : `Each application is checked on its own. Any that can't ${isReject ? "be rejected" : `move to ${stageLabel}`} are skipped and listed with the reason.${isReject ? " Rejection can't be undone." : ""}`}
          </p>
        </div>

        {summary ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-foreground">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              <div className="space-y-0.5">
                <p className="font-semibold">
                  {summary.moved > 0
                    ? `${pluralApplications(summary.moved)} ${isReject ? "rejected" : `moved to ${stageLabel}`}.`
                    : "No applications were changed."}
                </p>
                {summary.emailsQueued > 0 && (
                  <p>Emails to {summary.emailsQueued} candidate{summary.emailsQueued === 1 ? "" : "s"} are on their way.</p>
                )}
              </div>
            </div>
            {skippedItems.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-foreground">Skipped ({skippedItems.length})</h3>
                <ul className="max-h-56 space-y-1.5 overflow-y-auto text-xs">
                  {skippedItems.map((item) => (
                    <li key={item.applicationId} className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
                      <span className="font-semibold text-foreground">
                        {item.referenceCode ?? "Unknown application"}
                        {item.candidateName ? ` · ${item.candidateName}` : ""}
                      </span>
                      <span className="block text-muted-foreground">{item.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end">
              <Button type="button" size="sm" onClick={() => onClose(changed)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor={notesId} className="block text-xs font-medium text-foreground">
                Internal note <span className="font-normal text-muted-foreground">(optional, staff only)</span>
              </label>
              <textarea
                id={notesId}
                rows={2}
                maxLength={MAX_MESSAGE_LENGTH}
                value={internalNotes}
                onChange={(event) => setInternalNotes(event.target.value)}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>

            <div className="space-y-3 rounded-lg border border-border/70 p-3">
              <label htmlFor={emailToggleId} className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-foreground">
                <input
                  id={emailToggleId}
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(event) => {
                    setSendEmail(event.target.checked);
                    setPreview(null);
                    setPreviewError(null);
                  }}
                  className="h-4 w-4 cursor-pointer rounded border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                <Mail className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                Send email to candidates
              </label>

              {sendEmail && (
                <div className="space-y-2">
                  <label htmlFor={messageId} className="block text-xs font-medium text-foreground">
                    Message to candidates <span className="text-destructive">*</span>
                  </label>
                  <textarea
                    id={messageId}
                    rows={3}
                    required
                    maxLength={MAX_MESSAGE_LENGTH}
                    value={message}
                    onChange={(event) => {
                      setMessage(event.target.value);
                      setPreview(null);
                    }}
                    className="w-full rounded-lg border border-input bg-card px-3 py-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Sent with the standard application update email. Each candidate sees their own name, role and reference.
                  </p>
                  <Button type="button" size="sm" variant="outline" onClick={handlePreview} isLoading={isPreviewing}>
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    Preview email
                  </Button>
                  {previewError && (
                    <p role="alert" className="text-xs text-destructive">
                      {previewError}
                    </p>
                  )}
                  {preview && (
                    <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-xs" aria-live="polite">
                      <p className="text-[11px] text-muted-foreground">
                        Preview for {items[0]?.candidateName ?? "the first selected candidate"}
                      </p>
                      <p className="font-semibold text-foreground">{preview.subject}</p>
                      <p className="whitespace-pre-line text-muted-foreground">{preview.text}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" size="sm" variant="outline" onClick={close} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" size="sm" variant={isReject ? "destructive" : "primary"} isLoading={isSubmitting}>
                {isReject ? `Reject ${countLabel}` : `Move ${countLabel}`}
              </Button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
