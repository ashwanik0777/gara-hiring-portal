import { LoadingState } from "@/components/feedback/loading-state";

export default function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center p-12">
      <LoadingState message="Loading GARA Innovation portal..." />
    </div>
  );
}
