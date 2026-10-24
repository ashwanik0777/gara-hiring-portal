import { ResetPasswordScreen } from "@/components/auth/reset-password-screen";

export const instant = false;

export const metadata = {
  title: "Choose a New Password | GARA Innovation",
  description: "Complete your GARA Innovation password reset",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" && params.token.length > 0 ? params.token : null;
  const tokenError = typeof params.error === "string" ? params.error : null;

  return <ResetPasswordScreen token={token} tokenError={tokenError} />;
}
