"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { clientEnv } from "@/lib/env-client";
import { inputClasses } from "@/components/ui/input";
import { buttonClasses } from "@/components/ui/button";
import { AuthCard, FormError } from "./auth-card";
import { AuthDivider, GoogleButton, useOAuthErrorMessage } from "./google-button";
import { useAuthRedirect } from "./use-auth-redirect";

const LOCAL_EMAIL = clientEnv.NEXT_PUBLIC_LOCAL_AUTH_EMAIL;
const LOCAL_PASSWORD = clientEnv.NEXT_PUBLIC_LOCAL_AUTH_PASSWORD;

/**
 * Plain email/password sign-in used by local Docker Compose, which has no Resend
 * account to send OTP emails with and seeds one static account instead (see
 * scripts/seed-local-user.ts).
 */
export function LocalAuthForm({
  mode,
  googleEnabled,
}: {
  mode: "sign-in" | "sign-up";
  googleEnabled: boolean;
}) {
  const { goToApp } = useAuthRedirect();
  const oauthError = useOAuthErrorMessage(googleEnabled);
  const [email, setEmail] = useState(LOCAL_EMAIL);
  const [password, setPassword] = useState(LOCAL_PASSWORD);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(oauthError);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { error: authError } =
      mode === "sign-up"
        ? await authClient.signUp.email({ email, password, name: email })
        : await authClient.signIn.email({ email, password });

    setIsSubmitting(false);
    if (authError) {
      setError(authError.message ?? "Something went wrong");
      return;
    }
    goToApp();
  }

  return (
    <AuthCard
      mode={mode}
      subtitle="Local development sign-in (no email required)."
      error={error}
      onSubmit={handleSubmit}
    >
      {googleEnabled && (
        <>
          <GoogleButton />
          <AuthDivider />
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClasses}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClasses}
        />
      </div>

      <FormError message={error} />

      <button type="submit" disabled={isSubmitting} className={buttonClasses()}>
        {isSubmitting ? "Please wait…" : mode === "sign-up" ? "Create account" : "Sign in"}
      </button>
    </AuthCard>
  );
}
