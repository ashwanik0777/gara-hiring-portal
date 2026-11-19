import { Suspense } from "react";
import { AuthSplitScreen } from "@/components/auth/auth-split-screen";
import { RedirectSignedInUser } from "@/components/auth/redirect-signed-in-user";

export const instant = false;

export const metadata = {
  title: "Sign In",
  description: "Sign in to your GARA Innovation account to continue",
};

export default function LoginPage() {
  return (
    <>
      <Suspense fallback={null}>
        <RedirectSignedInUser />
      </Suspense>
      <AuthSplitScreen initialMode="login" />
    </>
  );
}
