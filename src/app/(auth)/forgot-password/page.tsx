import { Suspense } from "react";
import { AuthSplitScreen } from "@/components/auth/auth-split-screen";

export const instant = false;

export const metadata = {
  title: "Reset Password | GARA Innovation",
  description: "Reset your GARA Innovation account password",
};

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-xs text-muted-foreground animate-pulse">
          Loading reset password...
        </div>
      }
    >
      <AuthSplitScreen initialMode="forgot" />
    </Suspense>
  );
}
