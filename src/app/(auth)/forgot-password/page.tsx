import { Suspense } from "react";
import { AuthSplitScreen } from "@/components/auth/auth-split-screen";
import { AuthScreenSkeleton } from "@/components/feedback/page-skeletons";

export const instant = false;

export const metadata = {
  title: "Reset Password | GARA Innovation",
  description: "Reset your GARA Innovation account password",
};

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={<AuthScreenSkeleton label="Loading password reset" />}
    >
      <AuthSplitScreen initialMode="forgot" />
    </Suspense>
  );
}
