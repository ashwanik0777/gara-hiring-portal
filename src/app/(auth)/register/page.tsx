import { Suspense } from "react";
import { AuthSplitScreen } from "@/components/auth/auth-split-screen";
import { RedirectSignedInUser } from "@/components/auth/redirect-signed-in-user";

export const instant = false;

export const metadata = {
  title: "Create Account",
  description: "Create your GARA Innovation candidate account",
};

export default function RegisterPage() {
  return (
    <>
      <Suspense fallback={null}>
        <RedirectSignedInUser />
      </Suspense>
      <AuthSplitScreen initialMode="register" />
    </>
  );
}
