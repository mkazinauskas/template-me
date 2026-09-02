"use client";

import { LocalAuthForm } from "@/components/auth-form/local-auth-form";
import { OtpAuthForm } from "@/components/auth-form/otp-auth-form";

// Local Docker Compose has no Resend account to send OTP emails with, so it
// signs in with a plain email/password form instead of the OTP flow.
const LOCAL_MODE = process.env.NEXT_PUBLIC_LOCAL_MODE === "true";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  return LOCAL_MODE ? <LocalAuthForm mode={mode} /> : <OtpAuthForm mode={mode} />;
}
