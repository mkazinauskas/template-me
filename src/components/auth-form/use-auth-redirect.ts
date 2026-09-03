"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * Where to send the user after a successful sign-in/up: the `?redirect=` param
 * if present, otherwise the client dashboard. `goToApp` performs that
 * navigation and refreshes so server components pick up the new session.
 */
export function useAuthRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/client/dashboard";

  function goToApp() {
    router.push(redirectTo);
    router.refresh();
  }

  return { redirectTo, goToApp };
}
