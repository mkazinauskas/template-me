// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeSigning,
  readFakeSigning,
  readFakeSigningPdf,
  signFakeSigning,
} from "@/lib/dokobit/fake";

/** Stands in for LOCAL_MODE disk storage, keyed the same way (`local://<pathname>`). */
const stored = new Map<string, Buffer>();

vi.mock("@/lib/storage", () => ({
  putFile: vi.fn(async (pathname: string, buffer: Buffer) => {
    stored.set(`local://${pathname}`, buffer);
    return { url: `local://${pathname}`, pathname };
  }),
  getFile: vi.fn(async (url: string) => stored.get(url) ?? null),
  localFileUrl: (pathname: string) => `local://${pathname}`,
}));

vi.mock("@/lib/site-url", () => ({ siteUrl: "http://localhost:3000" }));

const PDF = Buffer.from("%PDF-1.7 filled document");
const SIGNER = { email: "jonas.petraitis@example.lt", name: "Jonas", surname: "Petraitis" };

function create() {
  return createFakeSigning({
    pdf: PDF,
    filename: "Offer_Letter.pdf",
    signingName: "Offer Letter",
    signer: SIGNER,
  });
}

describe("the fake Dokobit gateway", () => {
  beforeEach(() => {
    stored.clear();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("returns a signing URL pointing at the local signing page", async () => {
    const { signingToken, signingUrl } = await create();
    expect(signingUrl).toBe(`http://localhost:3000/fake-dokobit/${signingToken}`);
  });

  it("gives every signing its own token", async () => {
    const [a, b] = [await create(), await create()];
    expect(a.signingToken).not.toBe(b.signingToken);
  });

  it("stores the document and the signing's details", async () => {
    const { signingToken } = await create();

    expect(await readFakeSigningPdf(signingToken)).toEqual(PDF);
    expect(await readFakeSigning(signingToken)).toMatchObject({
      token: signingToken,
      filename: "Offer_Letter.pdf",
      signingName: "Offer Letter",
      signer: SIGNER,
      signedAt: null,
    });
  });

  it("says on the console that nothing actually went anywhere", async () => {
    await create();
    const logged = vi.mocked(console.log).mock.calls.flat().join("\n");
    expect(logged).toContain("[fake-dokobit]");
    expect(logged).toContain("no email sent");
    expect(logged).toContain(SIGNER.email);
  });

  it("marks a signing as signed", async () => {
    const { signingToken } = await create();

    const signed = await signFakeSigning(signingToken);
    expect(signed?.signedAt).toEqual(expect.any(String));
    // The timestamp is persisted, not just returned.
    expect((await readFakeSigning(signingToken))?.signedAt).toBe(signed?.signedAt);
  });

  it("keeps the original timestamp when signed twice", async () => {
    const { signingToken } = await create();

    const first = await signFakeSigning(signingToken);
    const second = await signFakeSigning(signingToken);
    expect(second?.signedAt).toBe(first?.signedAt);
  });

  it("returns null for an unknown token", async () => {
    expect(await readFakeSigning("nope")).toBeNull();
    expect(await readFakeSigningPdf("nope")).toBeNull();
    expect(await signFakeSigning("nope")).toBeNull();
  });

  it("refuses a token that isn't a safe path segment", async () => {
    // The token reaches this module straight from a URL segment, so a
    // traversal attempt must not become part of a storage pathname.
    for (const token of ["../../etc/passwd", "a/b", "with space", ""]) {
      expect(await readFakeSigning(token)).toBeNull();
      expect(await readFakeSigningPdf(token)).toBeNull();
    }
  });

  it("returns null when the stored metadata is corrupt", async () => {
    const { signingToken } = await create();
    stored.set(`local://dokobit/${signingToken}.json`, Buffer.from("not json"));
    expect(await readFakeSigning(signingToken)).toBeNull();
  });
});
