import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { getHomePathForUser } from "@/lib/auth/home";

export const instant = false;

export default async function DashboardRedirectPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/dashboard");
  }

  redirect(getHomePathForUser(user));
}
