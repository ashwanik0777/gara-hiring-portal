import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Role } from "@prisma/client";
import { SUB_ADMIN_ROLES } from "@/lib/auth/permissions";

export const instant = false;

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (user) {
    if (user.roles.includes(Role.ADMIN)) {
      redirect("/admin");
    }
    if (user.roles.some((r) => SUB_ADMIN_ROLES.includes(r))) {
      redirect("/subadmin");
    }
    redirect("/candidate/dashboard");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {children}
    </div>
  );
}
