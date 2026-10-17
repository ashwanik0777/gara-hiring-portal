import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { AuthSplitScreen } from "@/components/auth/auth-split-screen";

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
      fallback={
        <div className="min-h-screen flex items-center justify-center text-xs text-muted-foreground animate-pulse">
          Loading registration...
        </div>
      }
    >
      <AuthSplitScreen initialMode="register" />
    </Suspense>
  );
}
