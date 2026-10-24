import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { AuthSplitScreen } from "@/components/auth/auth-split-screen";
import { AuthScreenSkeleton } from "@/components/feedback/page-skeletons";

export const instant = false;

export const metadata = {
  title: "Create Account | GARA Innovation",
  description: "Create your GARA Innovation candidate account",
};

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) {
    if (user.mustChangePassword) {
      redirect("/set-password");
    }
    redirect("/dashboard");
  }

  return (
    <Suspense
      fallback={<AuthScreenSkeleton label="Loading registration" />}
    >
      <AuthSplitScreen initialMode="register" />
    </Suspense>
  );
}
