import { Suspense } from "react";
import { AuthSplitScreen } from "@/components/auth/auth-split-screen";

export const instant = false;

export const metadata = {
  title: "Sign In | GARA Innovation",
  description: "Sign in to your GARA Innovation account to continue",
};

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-xs text-muted-foreground animate-pulse">
          Loading sign in...
        </div>
      }
    >
      <AuthSplitScreen initialMode="login" />
    </Suspense>
  );
}
