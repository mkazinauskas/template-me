// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { call, ORPCError } from "@orpc/server";
import {
  ctx,
  GENERATE_FIELDS,
  importRouter,
  makeTemplate,
  MockDokobitError,
  mockTemplatesRouterDeps,
  resetState,
  state,
  VALID_DATA,
} from "./templates.test-helpers";

mockTemplatesRouterDeps();

const SIGNER = { email: "jonas.petraitis@example.lt", name: "Jonas", surname: "Petraitis" };

async function expectORPCError(
  promise: Promise<unknown>,
  code: string
): Promise<ORPCError<string, unknown>> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ORPCError) {
      expect(error.code).toBe(code);
      return error;
    }
    throw error;
  }
  throw new Error(`expected the call to reject with an ORPCError(${code})`);
}

function input(overrides: Record<string, unknown> = {}) {
  return { id: "t1", data: VALID_DATA, signer: SIGNER, ...overrides };
}

describe("templates.sendForSigning", () => {
  beforeEach(() => {
    resetState();
    state.rows = [makeTemplate({ fields: GENERATE_FIELDS })];
    state.storedFiles = { "https://blob/offer.docx": Buffer.from("original-docx-bytes") };
  });

  it("uploads the rendered PDF and returns the signer's signing link", async () => {
    const router = await importRouter();
    const result = await call(router.sendForSigning, input(), ctx());

    expect(result).toEqual({
      signingToken: "signing-token",
      signingUrl:
        "https://gateway.dokobit.test/signing/signing-token?access_token=signer-token",
      email: SIGNER.email,
    });
    expect(state.dokobitCalls).toHaveLength(1);
    const sent = state.dokobitCalls[0];
    expect(sent.signer).toEqual(SIGNER);
    expect(sent.filename).toBe("Offer_Letter.pdf");
    expect(sent.signingName).toBe("Offer Letter");
    // The bytes handed to Dokobit are the *converted* PDF, not the filled docx.
    expect((sent.pdf as Buffer).toString()).toContain("pdf:docx:");
  });

  it("rejects with NOT_IMPLEMENTED when the deployment has no Dokobit credentials", async () => {
    state.dokobitConfigured = false;
    const router = await importRouter();
    const error = await expectORPCError(
      call(router.sendForSigning, input(), ctx()),
      "NOT_IMPLEMENTED"
    );
    expect(error.message).toContain("not configured");
    expect(state.dokobitCalls).toHaveLength(0);
  });

  it("rejects with UNAUTHORIZED for an anonymous caller, even on a public template", async () => {
    state.session = null;
    state.rows = [makeTemplate({ isPublic: true, fields: GENERATE_FIELDS })];
    const router = await importRouter();
    await expectORPCError(call(router.sendForSigning, input(), ctx()), "UNAUTHORIZED");
    expect(state.dokobitCalls).toHaveLength(0);
  });

  it("rejects with NOT_FOUND for a template the caller may not view", async () => {
    state.rows = [makeTemplate({ userId: "someone-else", fields: GENERATE_FIELDS })];
    const router = await importRouter();
    await expectORPCError(call(router.sendForSigning, input(), ctx()), "NOT_FOUND");
  });

  it("rejects with TOO_MANY_REQUESTS when the signing rate limit is exceeded", async () => {
    state.rateLimited = true;
    const router = await importRouter();
    const error = await expectORPCError(
      call(router.sendForSigning, input(), ctx()),
      "TOO_MANY_REQUESTS"
    );
    expect(error.data).toEqual({ retryAfterSeconds: 30 });
    expect(state.dokobitCalls).toHaveLength(0);
  });

  it("requires every field — a half-filled document is never sent for signature", async () => {
    const router = await importRouter();
    const error = await expectORPCError(
      call(router.sendForSigning, input({ data: { full_name: "Jane Doe" } }), ctx()),
      "BAD_REQUEST"
    );
    expect(error.message).toContain("Missing values for");
    expect(state.dokobitCalls).toHaveLength(0);
  });

  it("rejects a malformed signer email before contacting Dokobit", async () => {
    const router = await importRouter();
    await expectORPCError(
      call(router.sendForSigning, input({ signer: { ...SIGNER, email: "not-an-email" } }), ctx()),
      "BAD_REQUEST"
    );
    expect(state.dokobitCalls).toHaveLength(0);
  });

  it("rejects a blank signer name before contacting Dokobit", async () => {
    const router = await importRouter();
    await expectORPCError(
      call(router.sendForSigning, input({ signer: { ...SIGNER, surname: "   " } }), ctx()),
      "BAD_REQUEST"
    );
    expect(state.dokobitCalls).toHaveLength(0);
  });

  it("surfaces a Dokobit-reported failure as BAD_GATEWAY, message intact", async () => {
    state.dokobitError = new MockDokobitError(
      "Dokobit rejected the request — signers[0][email]: This value is not a valid email."
    );
    const router = await importRouter();
    const error = await expectORPCError(
      call(router.sendForSigning, input(), ctx()),
      "BAD_GATEWAY"
    );
    expect(error.message).toContain("signers[0][email]");
  });

  it("hides an unexpected Dokobit client failure behind a generic message", async () => {
    state.dokobitError = new TypeError("fetch failed: ECONNREFUSED 1.2.3.4:443");
    const router = await importRouter();
    const error = await expectORPCError(
      call(router.sendForSigning, input(), ctx()),
      "BAD_GATEWAY"
    );
    expect(error.message).toBe("Failed to send the document for signing");
    expect(error.message).not.toContain("ECONNREFUSED");
  });

  it("fails without contacting Dokobit when PDF conversion fails", async () => {
    state.convertSingleError = new Error("libreoffice exploded");
    const router = await importRouter();
    await expectORPCError(
      call(router.sendForSigning, input(), ctx()),
      "INTERNAL_SERVER_ERROR"
    );
    expect(state.dokobitCalls).toHaveLength(0);
  });

  it("fails without contacting Dokobit when the template file is gone from storage", async () => {
    state.storedFiles = {};
    const router = await importRouter();
    await expectORPCError(
      call(router.sendForSigning, input(), ctx()),
      "INTERNAL_SERVER_ERROR"
    );
    expect(state.dokobitCalls).toHaveLength(0);
  });
});
