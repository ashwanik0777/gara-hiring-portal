import React from "react";
import { LoadingState } from "@/components/feedback/loading-state";

export default function CandidateLoading() {
  return (
    <div className="flex flex-1 items-center justify-center p-12 min-h-[400px]">
      <LoadingState message="Loading candidate portal..." />
    </div>
  );
}
