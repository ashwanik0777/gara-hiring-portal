import React from "react";
import { LoadingState } from "@/components/feedback/loading-state";

export default function AdminLoading() {
  return (
    <div className="flex flex-1 items-center justify-center p-12 min-h-[400px]">
      <LoadingState message="Loading GARA Admin operations..." />
    </div>
  );
}
