// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { googleCredentials, isGoogleAuthEnabled } from "@/lib/auth-providers";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("googleCredentials", () => {
  it("returns the pair when both vars are set", () => {
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";

    expect(googleCredentials()).toEqual({ clientId: "id", clientSecret: "secret" });
    expect(isGoogleAuthEnabled()).toBe(true);
  });

  it("reports the provider off when neither is set", () => {
    expect(googleCredentials()).toBeUndefined();
    expect(isGoogleAuthEnabled()).toBe(false);
  });

  it("reads the environment live, so the gate matches the running deployment", () => {
    expect(isGoogleAuthEnabled()).toBe(false);

    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";

    expect(isGoogleAuthEnabled()).toBe(true);
  });
});
