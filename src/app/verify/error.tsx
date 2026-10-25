"use client";

import { FriendlyError } from "@/components/feedback/friendly-error";

export default function ErrorBoundary({ error, retry }: { error: unknown; retry: () => void }) {
  return <FriendlyError error={error} retry={retry} homeHref="/verify" homeLabel="Back to verification" />;
}
