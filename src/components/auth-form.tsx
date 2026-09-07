"use client";

import { LocalAuthForm } from "@/components/auth-form/local-auth-form";
import { OtpAuthForm } from "@/components/auth-form/otp-auth-form";
import { clientEnv } from "@/lib/env-client";

// Local Docker Compose has no Resend account to send OTP emails with, so it
// signs in with a plain email/password form instead of the OTP flow.
const LOCAL_MODE = clientEnv.NEXT_PUBLIC_LOCAL_MODE;

/**
 * `googleEnabled` is resolved on the server (see src/lib/auth-providers.ts)
 * and passed down rather than read from a `NEXT_PUBLIC_*` var, so turning
 * Google sign-in on or off is a plain environment change on the deployment —
 * no rebuild, unlike the LOCAL_MODE flag above, which is baked into the
 * bundle.
 */
export function AuthForm({
  mode,
  googleEnabled,
}: {
  mode: "sign-in" | "sign-up";
  googleEnabled: boolean;
}) {
  return LOCAL_MODE ? (
    <LocalAuthForm mode={mode} googleEnabled={googleEnabled} />
  ) : (
    <OtpAuthForm mode={mode} googleEnabled={googleEnabled} />
  );
}
