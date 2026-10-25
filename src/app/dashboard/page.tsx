import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { resolveHomePath } from "@/features/lifecycle/services/lifecycle-service";

export const instant = false;

export default async function DashboardRedirectPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/dashboard");
  }

  redirect(await resolveHomePath(user));
}
