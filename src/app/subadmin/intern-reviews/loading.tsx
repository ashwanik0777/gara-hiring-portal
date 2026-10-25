import { ListCardSkeleton, PageHeaderSkeleton } from "@/components/feedback/page-skeletons";

/** Mirrors the review board: header, three scheduled sections and recent decisions. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading intern reviews</span>
      <PageHeaderSkeleton withAction={false} />
      <ListCardSkeleton rows={2} />
      <ListCardSkeleton rows={2} />
      <ListCardSkeleton rows={3} />
      <ListCardSkeleton rows={4} />
    </div>
  );
}
