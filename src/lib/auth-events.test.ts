// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { logAuthEvent, toAuthEvent } from "@/lib/auth-events";

const headers = (init: Record<string, string> = { "x-forwarded-for": "203.0.113.7" }) =>
  new Headers(init);

/** What better-auth leaves in `context.returned` when an endpoint fails. */
const apiError = (statusCode: number, code?: string) => ({
  statusCode,
  body: code ? { code } : undefined,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("toAuthEvent", () => {
  it("ignores paths that aren't sign-in attempts", () => {
    expect(toAuthEvent({ path: "/get-session", headers: headers() })).toBeNull();
    expect(toAuthEvent({ path: "/sign-out", headers: headers() })).toBeNull();
  });

  it("records a successful OTP sign-in with the new session's user id", () => {
    const event = toAuthEvent({
      path: "/sign-in/email-otp",
      body: { email: "user@example.com", otp: "123456" },
      headers: headers(),
      returned: { token: "t" },
      newSession: { user: { id: "user-1" } },
    });

    expect(event).toMatchObject({
      tag: "auth-event",
      event: "sign_in",
      outcome: "success",
      ip: "203.0.113.7",
      email: "user@example.com",
      userId: "user-1",
    });
  });

  it("records a failed OTP sign-in with better-auth's error code", () => {
    const event = toAuthEvent({
      path: "/sign-in/email-otp",
      body: { email: "user@example.com", otp: "000000" },
      headers: headers(),
      returned: apiError(401, "INVALID_OTP"),
    });

    expect(event).toMatchObject({ outcome: "failure", status: 401, code: "INVALID_OTP" });
  });

  it("records an exhausted-attempts failure, the tail of a brute-force run", () => {
    const event = toAuthEvent({
      path: "/sign-in/email-otp",
      headers: headers(),
      returned: apiError(403, "TOO_MANY_ATTEMPTS"),
    });

    expect(event).toMatchObject({ outcome: "failure", code: "TOO_MANY_ATTEMPTS" });
  });

  it("never logs the submitted OTP or password", () => {
    const event = toAuthEvent({
      path: "/sign-in/email",
      body: { email: "user@example.com", password: "hunter2" },
      headers: headers(),
      returned: apiError(401),
    });

    expect(JSON.stringify(event)).not.toContain("hunter2");
    expect(JSON.stringify(event)).not.toContain("password");
  });

  it("treats a payload with no status code as a success, since that's what one looks like", () => {
    // A successful endpoint returns its own value; only an APIError carries a
    // numeric `statusCode`, so absence of one must not read as a failure.
    expect(
      toAuthEvent({ path: "/sign-in/email-otp", headers: headers(), returned: undefined })
    ).toMatchObject({ outcome: "success" });

    expect(
      toAuthEvent({ path: "/sign-in/email-otp", headers: headers(), returned: { token: "t" } })
    ).toMatchObject({ outcome: "success" });
  });

  it("counts a 5xx as a failed attempt too, not just a rejected credential", () => {
    expect(
      toAuthEvent({ path: "/sign-in/email-otp", headers: headers(), returned: apiError(500) })
    ).toMatchObject({ outcome: "failure", status: 500 });
  });

  it("tracks OTP requests separately, so enumeration is visible", () => {
    const event = toAuthEvent({
      path: "/email-otp/send-verification-otp",
      body: { email: "user@example.com" },
      headers: headers(),
      returned: { success: true },
    });

    expect(event).toMatchObject({ event: "otp_requested", outcome: "success" });
  });

  it("attributes the request to the last forwarded hop, not a spoofed prefix", () => {
    const event = toAuthEvent({
      path: "/sign-in/email-otp",
      headers: headers({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" }),
      returned: apiError(401),
    });

    expect(event?.ip).toBe("203.0.113.7");
  });

  it("falls back to a shared bucket when the request carries no address", () => {
    const event = toAuthEvent({ path: "/sign-in/email-otp", returned: apiError(401) });
    expect(event?.ip).toBe("unknown");
  });
});

describe("logAuthEvent", () => {
  it("writes failures to console.error as one JSON line", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    logAuthEvent({
      path: "/sign-in/email-otp",
      body: { email: "user@example.com" },
      headers: headers(),
      returned: apiError(401, "INVALID_OTP"),
    });

    expect(error).toHaveBeenCalledTimes(1);
    const line = error.mock.calls[0][0] as string;
    expect(line.split("\n")).toHaveLength(1);
    expect(JSON.parse(line)).toMatchObject({ tag: "auth-event", code: "INVALID_OTP" });
  });

  it("writes successes to console.info", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logAuthEvent({ path: "/sign-in/email-otp", headers: headers(), returned: { token: "t" } });

    expect(info).toHaveBeenCalledTimes(1);
  });

  it("stays silent on paths it doesn't audit", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    logAuthEvent({ path: "/get-session", headers: headers() });

    expect(info).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("swallows its own failures rather than breaking the sign-in it observes", () => {
    vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("log transport down");
    });

    expect(() =>
      logAuthEvent({ path: "/sign-in/email-otp", headers: headers(), returned: apiError(401) })
    ).not.toThrow();
  });
});
