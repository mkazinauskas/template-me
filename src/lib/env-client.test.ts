import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

/**
 * The module parses at import time (its values are build-time constants in a
 * real bundle), so each case sets the environment and re-imports it.
 */
async function importClientEnv(vars: Record<string, string>) {
  vi.resetModules();
  process.env = { ...originalEnv, ...vars };
  return (await import("@/lib/env-client")).clientEnv;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("clientEnv", () => {
  it("reads the NEXT_PUBLIC_* vars", async () => {
    const clientEnv = await importClientEnv({
      NEXT_PUBLIC_LOCAL_MODE: "true",
      NEXT_PUBLIC_LOCAL_AUTH_EMAIL: "demo@example.com",
      NEXT_PUBLIC_LOCAL_AUTH_PASSWORD: "localpassword123",
    });

    expect(clientEnv).toEqual({
      NEXT_PUBLIC_LOCAL_MODE: true,
      NEXT_PUBLIC_LOCAL_AUTH_EMAIL: "demo@example.com",
      NEXT_PUBLIC_LOCAL_AUTH_PASSWORD: "localpassword123",
    });
  });

  it("defaults the credentials to empty strings, which the sign-in form renders as blank fields", async () => {
    const clientEnv = await importClientEnv({});

    expect(clientEnv.NEXT_PUBLIC_LOCAL_AUTH_EMAIL).toBe("");
    expect(clientEnv.NEXT_PUBLIC_LOCAL_AUTH_PASSWORD).toBe("");
  });

  it("treats anything but the exact string \"true\" as local mode off", async () => {
    expect((await importClientEnv({ NEXT_PUBLIC_LOCAL_MODE: "TRUE" })).NEXT_PUBLIC_LOCAL_MODE).toBe(
      false
    );
    expect((await importClientEnv({ NEXT_PUBLIC_LOCAL_MODE: "1" })).NEXT_PUBLIC_LOCAL_MODE).toBe(
      false
    );
    // A valueless Docker `ARG` arrives as the empty string.
    expect((await importClientEnv({ NEXT_PUBLIC_LOCAL_MODE: "" })).NEXT_PUBLIC_LOCAL_MODE).toBe(
      false
    );
    expect((await importClientEnv({})).NEXT_PUBLIC_LOCAL_MODE).toBe(false);
  });
});
