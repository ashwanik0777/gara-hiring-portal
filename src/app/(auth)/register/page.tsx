import { Suspense } from "react";
import { AuthSplitScreen } from "@/components/auth/auth-split-screen";

export const instant = false;

export const metadata = {
  title: "Create Account | GARA Innovation",
  description: "Create your GARA Innovation candidate account",
};

export default function RegisterPage() {
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
