import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { SetPasswordScreen } from "@/components/auth/set-password-screen";
import { resolveHomePath } from "@/features/lifecycle/services/lifecycle-service";

export const instant = false;

export const metadata = {
  title: "Set Permanent Password | GARA Innovation",
  description: "Set your permanent password on first sign-in",
};

export default async function SetPasswordPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // If user does not need to change password, redirect them to their home portal
  if (!user.mustChangePassword) {
    redirect(await resolveHomePath(user));
  }

  return (
    <SetPasswordScreen
      userEmail={user.email}
      userName={user.name}
      userRoles={user.roles.map((r) => String(r))}
    />
  );
}
