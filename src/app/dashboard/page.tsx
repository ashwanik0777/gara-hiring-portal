import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Role } from "@prisma/client";

import { SUB_ADMIN_ROLES } from "@/lib/auth/permissions";

export const instant = false;

export default async function DashboardRedirectPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/dashboard");
  }

  if (user.roles.includes(Role.ADMIN)) {
    redirect("/admin");
  }

  const isSubAdmin = user.roles.some((r) => SUB_ADMIN_ROLES.includes(r));

  if (isSubAdmin) {
    redirect("/subadmin");
  }

  redirect("/candidate/dashboard");
}
