import { createAuthClient } from "better-auth/react";
import { emailOTPClient, twoFactorClient } from "better-auth/client/plugins";

/**
 * `twoFactorClient()` is used without `twoFactorPage`/`onTwoFactorRedirect`: the sign-in form
 * reads `twoFactorRedirect` from the response and shows its own code step (no page reload).
 */
export const authClient = createAuthClient({
  plugins: [emailOTPClient(), twoFactorClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
