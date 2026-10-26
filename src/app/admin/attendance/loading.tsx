import { AttendancePageSkeleton } from "@/features/attendance/components/attendance-page-skeleton";

export default function Loading() {
  return (
    <div className="w-full space-y-6">
      <AttendancePageSkeleton />
    </div>
  );
}
