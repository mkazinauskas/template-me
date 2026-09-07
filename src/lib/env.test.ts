// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env, validateEnv } from "@/lib/env";

const originalEnv = { ...process.env };

/** A production environment with every var the app requires there. */
function productionEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://example/db",
    BETTER_AUTH_SECRET: "secret",
    BETTER_AUTH_URL: "https://example.com",
    BLOB_READ_WRITE_TOKEN: "token",
    ...overrides,
  };
}

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("flags and defaults", () => {
  it("treats only the exact string \"true\" as an enabled flag", () => {
    expect(validateEnv({ LOCAL_MODE: "true" }).LOCAL_MODE).toBe(true);
    expect(validateEnv({ LOCAL_MODE: "TRUE" }).LOCAL_MODE).toBe(false);
    expect(validateEnv({ LOCAL_MODE: "1" }).LOCAL_MODE).toBe(false);
    expect(validateEnv({}).LOCAL_MODE).toBe(false);
  });

  it("applies defaults for the local-mode vars", () => {
    const parsed = validateEnv({});

    expect(parsed.LOCAL_STORAGE_DIR).toBe("/data/blobs");
    expect(parsed.LOCAL_AUTH_EMAIL).toBe("demo@example.com");
    expect(parsed.LOCAL_AUTH_PASSWORD).toBe("localpassword123");
    expect(parsed.LOCAL_AUTH_NAME).toBe("Local User");
    expect(parsed.NODE_ENV).toBe("development");
  });

  it("treats an empty string as unset, so Docker's valueless ARG falls back to the default", () => {
    // `ARG LOCAL_STORAGE_DIR` with no value becomes `LOCAL_STORAGE_DIR=""`.
    const parsed = validateEnv({ LOCAL_STORAGE_DIR: "", LOCAL_MODE: "" });

    expect(parsed.LOCAL_STORAGE_DIR).toBe("/data/blobs");
    expect(parsed.LOCAL_MODE).toBe(false);
  });

  it("rejects a malformed value", () => {
    expect(() => validateEnv({ BETTER_AUTH_URL: "not-a-url" })).toThrow(
      /BETTER_AUTH_URL/
    );
  });
});

describe("production requirements", () => {
  it("accepts a fully configured production environment", () => {
    expect(() => validateEnv(productionEnv())).not.toThrow();
  });

  it("names every missing var in one error", () => {
    let message = "";
    try {
      validateEnv({ NODE_ENV: "production" });
    } catch (err) {
      message = (err as Error).message;
    }

    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("BETTER_AUTH_SECRET");
    expect(message).toContain("BLOB_READ_WRITE_TOKEN");
    expect(message).toContain("BETTER_AUTH_URL");
  });

  it("does not require BETTER_AUTH_URL on Vercel, where VERCEL_URL supplies the origin", () => {
    expect(() =>
      validateEnv(productionEnv({ BETTER_AUTH_URL: undefined, VERCEL_URL: "app.vercel.app" }))
    ).not.toThrow();
  });

  it("skips the cloud requirements in LOCAL_MODE", () => {
    expect(() =>
      validateEnv({ NODE_ENV: "production", LOCAL_MODE: "true" })
    ).not.toThrow();
  });

  it("skips them outside production", () => {
    expect(() => validateEnv({ NODE_ENV: "development" })).not.toThrow();
  });

  it("refuses a production build that ships the dev-only password to the client bundle", () => {
    expect(() =>
      validateEnv(productionEnv({ NEXT_PUBLIC_LOCAL_AUTH_PASSWORD: "localpassword123" }))
    ).toThrow(/NEXT_PUBLIC_LOCAL_AUTH_PASSWORD/);
  });

  it("allows that password in a LOCAL_MODE production build (the published demo image)", () => {
    expect(() =>
      validateEnv({
        NODE_ENV: "production",
        LOCAL_MODE: "true",
        NEXT_PUBLIC_LOCAL_AUTH_PASSWORD: "localpassword123",
      })
    ).not.toThrow();
  });
});

describe("Google OAuth credentials", () => {
  it("accepts both set, or neither", () => {
    expect(
      validateEnv({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" }).GOOGLE_CLIENT_ID
    ).toBe("id");
    expect(validateEnv({}).GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it("rejects a half-configured pair, naming the missing half", () => {
    expect(() => validateEnv({ GOOGLE_CLIENT_ID: "id" })).toThrow(/GOOGLE_CLIENT_SECRET/);
    expect(() => validateEnv({ GOOGLE_CLIENT_SECRET: "secret" })).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it("enforces the pairing outside production too, unlike the cloud requirements", () => {
    expect(() => validateEnv(productionEnv({ GOOGLE_CLIENT_ID: "id" }))).toThrow(
      /GOOGLE_CLIENT_SECRET/
    );
    expect(() => validateEnv({ LOCAL_MODE: "true", GOOGLE_CLIENT_ID: "id" })).toThrow(
      /GOOGLE_CLIENT_SECRET/
    );
  });
});

describe("SITE_URL", () => {
  it("prefers Vercel's production domain, then the deployment URL, then the explicit override", () => {
    expect(
      validateEnv({
        VERCEL_PROJECT_PRODUCTION_URL: "app.com",
        VERCEL_URL: "dep.vercel.app",
        BETTER_AUTH_URL: "https://override.com",
      }).SITE_URL
    ).toBe("https://app.com");

    expect(
      validateEnv({
        VERCEL_URL: "dep.vercel.app",
        BETTER_AUTH_URL: "https://override.com",
      }).SITE_URL
    ).toBe("https://dep.vercel.app");

    expect(
      validateEnv({ BETTER_AUTH_URL: "https://override.com" }).SITE_URL
    ).toBe("https://override.com");

    expect(validateEnv({}).SITE_URL).toBe("http://localhost:3000");
  });

  it("strips trailing slashes so callers can append a path", () => {
    expect(
      validateEnv({ BETTER_AUTH_URL: "https://example.com//" }).SITE_URL
    ).toBe("https://example.com");
  });
});

describe("env", () => {
  it("reads process.env live, so a var set after import is picked up", () => {
    expect(env.LOCAL_MODE).toBe(false);

    process.env.LOCAL_MODE = "true";

    expect(env.LOCAL_MODE).toBe(true);
  });

  it("exposes the derived SITE_URL alongside the raw vars", () => {
    process.env.BETTER_AUTH_URL = "https://example.com";

    expect(env.SITE_URL).toBe("https://example.com");
    expect(env.BETTER_AUTH_URL).toBe("https://example.com");
  });
});
