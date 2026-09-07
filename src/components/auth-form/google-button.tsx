"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { buttonClasses } from "@/components/ui/button";
import { useAuthRedirect } from "./use-auth-redirect";

/** Google's brand mark, inlined so the button needs no network request to render. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" className="size-4 shrink-0">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/**
 * "Continue with Google". Rendered only where the server has confirmed the
 * provider is configured (see src/lib/auth-providers.ts) — the endpoint does
 * not exist otherwise.
 *
 * Unlike the email flows this never resolves in place: `signIn.social` sends
 * the browser to Google and control comes back at `/api/auth/callback/google`,
 * which drops the user at `callbackURL`. So there is no success path to handle
 * here, and the button stays disabled while the redirect is in flight.
 * Failures come back as `?error=` on the sign-in page — see AuthCard's caller.
 */
export function GoogleButton({ mode }: { mode: "sign-in" | "sign-up" }) {
  const { redirectTo } = useAuthRedirect();
  const [isRedirecting, setIsRedirecting] = useState(false);

  return (
    <button
      type="button"
      disabled={isRedirecting}
      onClick={() => {
        setIsRedirecting(true);
        void authClient.signIn.social({
          provider: "google",
          callbackURL: redirectTo,
          // Where better-auth sends the browser when Google denies the request
          // or the callback fails; it appends `?error=...`, which the form
          // reads back to show a message instead of a bare bounce to the
          // sign-in page.
          errorCallbackURL: mode === "sign-up" ? "/sign-up" : "/sign-in",
        });
      }}
      className={buttonClasses({
        variant: "secondary",
        className: "flex items-center justify-center gap-2",
      })}
    >
      <GoogleMark />
      {isRedirecting ? "Redirecting…" : "Continue with Google"}
    </button>
  );
}

/** A labelled rule separating the Google button from the email form. */
export function AuthDivider() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground">or</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * The message to show after a failed Google round-trip, or null.
 *
 * better-auth bounces the browser back to `errorCallbackURL` with an
 * `?error=<code>` it chose (`access_denied`, `state_mismatch`, …). Those codes
 * are internal and mean nothing to the person reading them, so they collapse
 * into one sentence that also points at the way in that still works.
 */
export function useOAuthErrorMessage(): string | null {
  const error = useSearchParams().get("error");
  if (!error) return null;
  return "Google sign-in didn't complete. Try again, or use an email code instead.";
}
