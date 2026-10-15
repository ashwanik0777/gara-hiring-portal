"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/feedback/error-state";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log unexpected errors safely on client
    console.error("App boundary error caught:", error.message);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <ErrorState
        title="Application Error"
        message="An unexpected error occurred while processing this request."
        reset={reset}
      />
    </div>
  );
}
