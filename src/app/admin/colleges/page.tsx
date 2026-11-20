import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { ForbiddenError } from "@/lib/errors";
import { listCollegesForStaff } from "@/features/colleges/services/college-service";
import { CollegeModeration, type CollegeRow } from "@/features/colleges/components/college-moderation";

export const instant = false;

export const metadata = {
  title: "Colleges",
  robots: { index: false, follow: false },
};

export default async function AdminCollegesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/admin/colleges");

  let colleges: CollegeRow[];
  try {
    colleges = (await listCollegesForStaff(user)).map((college) => ({
      id: college.id,
      name: college.name,
      city: college.city,
      state: college.state,
      status: college.status,
      students: college._count.candidates,
    }));
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return <UnauthorizedState message="You do not have permission to manage colleges." />;
    }
    throw error;
  }

  return (
    <div className="w-full space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Colleges</h2>
        <p className="text-sm text-muted-foreground">
          The college list students pick from on the apply form. Approve the colleges students add so others can find them.
        </p>
      </div>
      <CollegeModeration colleges={colleges} />
    </div>
  );
}
