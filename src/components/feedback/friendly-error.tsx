"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RefreshCw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FriendlyErrorProps {
  error: unknown;
  retry: () => void;
  /** Where "go back" leads (the portal home of this segment). */
  homeHref?: string;
  homeLabel?: string;
  title?: string;
  message?: string;
}

/**
 * Plain-language error view for route error boundaries. Users never see technical
 * details: only a short message, a retry, a way home and a reference code that matches
 * the server log entry (Next.js `digest`).
 */
export function FriendlyError({
  error,
  retry,
  homeHref = "/",
  homeLabel = "Go to home",
  title = "Something went wrong",
  message = "We couldn't load this page right now. Please try again in a moment.",
}: FriendlyErrorProps) {
  const digest =
    typeof error === "object" && error !== null && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : null;

  useEffect(() => {
    // Only the reference is logged in the browser; details stay in server logs.
    console.error("Page error", digest ? { reference: digest } : undefined);
  }, [digest]);

  return (
    <div role="alert" className="flex flex-1 items-center justify-center p-6 sm:p-10">
      <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-6 text-center shadow-sm sm:p-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button onClick={() => retry()} className="gap-2">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
          </Button>
          <Link
            href={homeHref}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {homeLabel}
          </Link>
        </div>
        {digest && (
          <p className="mt-5 text-[11px] text-muted-foreground">
            If this keeps happening, contact support and mention reference <span className="font-mono">{digest}</span>.
          </p>
        )}
      </div>
    </div>
  );
}
