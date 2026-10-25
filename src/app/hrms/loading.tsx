import { OverviewPageSkeleton } from "@/components/feedback/page-skeletons";

// Employee home skeleton; attendance, leave and payroll keep their own loading files.
export default function Loading() {
  return <OverviewPageSkeleton label="Loading employee home" />;
}
