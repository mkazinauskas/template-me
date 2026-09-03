import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
}

export const config = {
  // `/public/templates` (browse) and `/public/templates/[id]` are intentionally
  // NOT gated here: the list shows a public-template preview to logged-out
  // visitors, and the detail page / generate API enforce `canViewTemplate`
  // themselves. Everything under `/client/*` and `/admin/*` requires a session
  // (the admin pages additionally check `role === "admin"` in-page).
  matcher: ["/client/:path*", "/admin/:path*"],
};
