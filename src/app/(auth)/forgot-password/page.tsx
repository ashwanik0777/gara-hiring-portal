import { AuthSplitScreen } from "@/components/auth/auth-split-screen";

export const instant = false;

export const metadata = {
  title: "Reset Password",
  description: "Reset your GARA Innovation account password",
};

export default function ForgotPasswordPage() {
  return <AuthSplitScreen initialMode="forgot" />;
}
