import { redirect } from "next/navigation";
import { CheckCircle2, Clock, GraduationCap, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/guards";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { ForbiddenError } from "@/lib/errors";
import { listCollegesForStaff } from "@/features/colleges/services/college-service";
import { CollegeModeration, type CollegeRow } from "@/features/colleges/components/college-moderation";
import { FilterChipLink } from "@/features/employees/components/filter-chip-link";

export const instant = false;

export const metadata = {
  title: "Colleges",
  robots: { index: false, follow: false },
};

const BASE = "/admin/colleges";
type Filter = "PENDING" | "APPROVED" | null;

export default async function AdminCollegesPage({ searchParams }: { searchParams: Promise<{ status?: string | string[] }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=${BASE}`);
  const raw = (await searchParams).status;
  const requested = (Array.isArray(raw) ? raw[0] : raw)?.toUpperCase();
  const filter: Filter = requested === "PENDING" || requested === "APPROVED" ? requested : null;

  let colleges: CollegeRow[];
  try {
    colleges = (await listCollegesForStaff(user)).map((college) => ({
      id: college.id,
      name: college.name,
      city: college.city,
      state: college.state,
      status: college.status,
      students: college._count.candidates,
      ambassadors: college._count.ambassadors,
    }));
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return <UnauthorizedState message="You do not have permission to manage colleges." />;
    }
    throw error;
  }

  const pending = colleges.filter((college) => college.status === "PENDING").length;
  const approved = colleges.length - pending;
  const students = colleges.reduce((sum, college) => sum + college.students, 0);
  const href = (status: Filter) => (status ? `${BASE}?status=${status.toLowerCase()}` : BASE);
  const shown = filter ? colleges.filter((college) => college.status === filter) : colleges;

  return (
    <div className="w-full space-y-6">
      <StatGrid columns={4} label="College summary">
        <StatCard label="Colleges" value={colleges.length} icon={GraduationCap} tone="blue" href={href(null)} />
        <StatCard label="Pending Approval" value={pending} icon={Clock} tone="amber" href={href("PENDING")} />
        <StatCard label="Approved" value={approved} icon={CheckCircle2} tone="emerald" href={href("APPROVED")} />
        <StatCard label="Students Linked" value={students} icon={Users} tone="violet" />
      </StatGrid>

      <nav aria-label="Filter colleges" className="flex flex-wrap gap-2">
        <FilterChipLink href={href(null)} active={filter === null} label="All" count={colleges.length} />
        <FilterChipLink href={href("PENDING")} active={filter === "PENDING"} label="Pending" count={pending} emphasis />
        <FilterChipLink href={href("APPROVED")} active={filter === "APPROVED"} label="Approved" count={approved} />
      </nav>

      <CollegeModeration key={filter ?? "all"} colleges={shown} all={colleges} />
    </div>
  );
}
