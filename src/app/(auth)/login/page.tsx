import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { AuthSplitScreen } from "@/components/auth/auth-split-screen";
import { AuthScreenSkeleton } from "@/components/feedback/page-skeletons";

export const instant = false;

export const metadata = {
  title: "Sign In | GARA Innovation",
  description: "Sign in to your GARA Innovation account to continue",
};

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    if (user.mustChangePassword) {
      redirect("/set-password");
    }
    redirect("/dashboard");
  }

  return (
    <Suspense
      fallback={<AuthScreenSkeleton label="Loading sign in" />}
    >
      <AuthSplitScreen initialMode="login" />
    </Suspense>
  );
}
