// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { call, ORPCError } from "@orpc/server";
import type { FakeSigning } from "@/lib/dokobit/fake";

const state: { fakeMode: boolean; signing: FakeSigning | null; pdf: Buffer | null } = {
  fakeMode: true,
  signing: null,
  pdf: null,
};

vi.mock("@/lib/dokobit", () => ({ isFakeDokobit: () => state.fakeMode }));

vi.mock("@/lib/dokobit/fake", () => ({
  readFakeSigningPdf: vi.fn(async () => state.pdf),
  signFakeSigning: vi.fn(async () =>
    state.signing ? { ...state.signing, signedAt: "2026-09-06T10:00:00.000Z" } : null
  ),
}));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => null } } }));

const { fakeDokobitRouter } = await import("@/server/orpc/routers/fake-dokobit");

const SIGNING: FakeSigning = {
  token: "abc123",
  filename: "Offer_Letter.pdf",
  signingName: "Offer Letter",
  signer: { email: "jonas.petraitis@example.lt", name: "Jonas", surname: "Petraitis" },
  createdAt: "2026-09-06T09:00:00.000Z",
  signedAt: null,
};

const ctx = { context: { headers: new Headers() } };

async function expectNotFound(promise: Promise<unknown>) {
  await expect(promise).rejects.toSatisfy(
    (err: unknown) => err instanceof ORPCError && err.code === "NOT_FOUND"
  );
}

describe("fakeDokobit router", () => {
  beforeEach(() => {
    state.fakeMode = true;
    state.signing = SIGNING;
    state.pdf = Buffer.from("%PDF-1.7");
  });

  it("returns the stored PDF", async () => {
    const file = await call(fakeDokobitRouter.download, { token: "abc123" }, ctx);
    expect(file.type).toBe("application/pdf");
    expect(await file.text()).toBe("%PDF-1.7");
  });

  it("signs the signing", async () => {
    const result = await call(fakeDokobitRouter.sign, { token: "abc123" }, ctx);
    expect(result.signing.signedAt).toBe("2026-09-06T10:00:00.000Z");
  });

  it("404s every procedure when the app is not on the fake gateway", async () => {
    // This router ships in every build, so being inert outside LOCAL_MODE is
    // the whole of its access control.
    state.fakeMode = false;
    await expectNotFound(call(fakeDokobitRouter.download, { token: "abc123" }, ctx));
    await expectNotFound(call(fakeDokobitRouter.sign, { token: "abc123" }, ctx));
  });

  it("404s for an unknown token", async () => {
    state.signing = null;
    state.pdf = null;
    await expectNotFound(call(fakeDokobitRouter.download, { token: "nope" }, ctx));
    await expectNotFound(call(fakeDokobitRouter.sign, { token: "nope" }, ctx));
  });

  it("rejects an empty or oversized token before touching storage", async () => {
    await expect(call(fakeDokobitRouter.download, { token: "" }, ctx)).rejects.toThrow();
    await expect(
      call(fakeDokobitRouter.download, { token: "x".repeat(65) }, ctx)
    ).rejects.toThrow();
  });
});
