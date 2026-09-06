"use client";

import { LocalAuthForm } from "@/components/auth-form/local-auth-form";
import { OtpAuthForm } from "@/components/auth-form/otp-auth-form";
import { clientEnv } from "@/lib/env-client";

// Local Docker Compose has no Resend account to send OTP emails with, so it
// signs in with a plain email/password form instead of the OTP flow.
const LOCAL_MODE = clientEnv.NEXT_PUBLIC_LOCAL_MODE;

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  return LOCAL_MODE ? <LocalAuthForm mode={mode} /> : <OtpAuthForm mode={mode} />;
}
