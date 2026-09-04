import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSessionCookie = vi.hoisted(() => vi.fn());
vi.mock("better-auth/cookies", () => ({ getSessionCookie }));

async function run(pathname: string) {
  const { proxy } = await import("@/proxy");
  return proxy(new NextRequest(new URL(pathname, "https://example.com")));
}

describe("proxy", () => {
  beforeEach(() => {
    getSessionCookie.mockReset();
  });

  it("redirects an unauthenticated request under /client to sign-in with a redirect back", async () => {
    getSessionCookie.mockReturnValue(null);
    const res = await run("/client/dashboard");

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("redirect")).toBe("/client/dashboard");
  });

  it("redirects an unauthenticated request under /admin, preserving the target path", async () => {
    getSessionCookie.mockReturnValue(null);
    const res = await run("/admin/dashboard");

    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("redirect")).toBe("/admin/dashboard");
  });

  it("lets an authenticated request through untouched", async () => {
    getSessionCookie.mockReturnValue("session-token");
    const res = await run("/client/dashboard");

    expect(res.headers.get("location")).toBeNull();
    // NextResponse.next() carries this internal header.
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("only guards /client/* and /admin/* routes", async () => {
    const { config } = await import("@/proxy");
    expect(config.matcher).toEqual(["/client/:path*", "/admin/:path*"]);
  });
});
