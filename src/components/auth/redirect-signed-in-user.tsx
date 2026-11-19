import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";

/**
 * Sends a visitor who is already signed in away from the sign-in screens. It renders in its
 * own Suspense boundary (fallback null) so the form itself stays in the static HTML, visible
 * without JavaScript and in link previews; the auth screen also redirects on the client once
 * the session is known.
 */
export async function RedirectSignedInUser() {
  const user = await getCurrentUser();
  if (user) {
    redirect(user.mustChangePassword ? "/set-password" : "/dashboard");
  }
  return null;
}
