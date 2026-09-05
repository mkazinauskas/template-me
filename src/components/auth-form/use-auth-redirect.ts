"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * A same-origin, in-app path: starts with a single `/` (not `//` or `/\`,
 * which browsers treat as protocol-relative and would navigate off-site).
 */
function isSafeRedirectPath(value: string): boolean {
  return /^\/(?!\/|\\)/.test(value);
}

/**
 * Where to send the user after a successful sign-in/up: the `?redirect=` param
 * if present and same-origin, otherwise the client dashboard. `goToApp`
 * performs that navigation and refreshes so server components pick up the
 * new session.
 */
export function useAuthRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRedirect = searchParams.get("redirect");
  const redirectTo =
    requestedRedirect && isSafeRedirectPath(requestedRedirect)
      ? requestedRedirect
      : "/client/dashboard";

  function goToApp() {
    router.push(redirectTo);
    router.refresh();
  }

  return { redirectTo, goToApp };
}
