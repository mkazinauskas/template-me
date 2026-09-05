// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSigning, DokobitError, isDokobitConfigured, isFakeDokobit } from "@/lib/dokobit";
import { createFakeSigning } from "@/lib/dokobit/fake";

vi.mock("@/lib/dokobit/fake", () => ({
  createFakeSigning: vi.fn(async () => ({
    signingToken: "fake-token",
    signingUrl: "http://localhost:3000/fake-dokobit/fake-token",
  })),
}));

const PDF = Buffer.from("%PDF-1.7 filled document");
const ACCESS_TOKEN = "gateway-access-token";

type Call = { url: string; method: string; body: URLSearchParams | null };

let calls: Call[];
/** Queued responses, consumed in order by the mocked `fetch`. */
let responses: { status?: number; body: unknown }[];

function mockFetch() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body instanceof URLSearchParams ? init.body : null,
    });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected fetch: ${url}`);
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  });
}

function signingArgs() {
  return {
    pdf: PDF,
    filename: "Offer_Letter.pdf",
    signingName: "Offer Letter",
    signer: { email: "jonas.petraitis@example.lt", name: "Jonas", surname: "Petraitis" },
    signerId: "signer-1",
  };
}

/** The three responses of a fully successful upload → status → create sequence. */
function happyPath() {
  return [
    { body: { status: "ok", token: "file-token" } },
    { body: { status: "uploaded" } },
    { body: { status: "ok", token: "signing-token", signers: { "signer-1": "signer-token" } } },
  ];
}

beforeEach(() => {
  calls = [];
  responses = [];
  vi.stubEnv("LOCAL_MODE", "");
  vi.stubEnv("DOKOBIT_ACCESS_TOKEN", ACCESS_TOKEN);
  vi.stubEnv("DOKOBIT_API_URL", "https://gateway-sandbox.dokobit.test");
  vi.stubGlobal("fetch", mockFetch());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("isDokobitConfigured", () => {
  it("is true only when an access token is set", () => {
    expect(isDokobitConfigured()).toBe(true);
    vi.stubEnv("DOKOBIT_ACCESS_TOKEN", "");
    expect(isDokobitConfigured()).toBe(false);
  });

  it("is true in LOCAL_MODE with no token, where the fake stands in", () => {
    vi.stubEnv("DOKOBIT_ACCESS_TOKEN", "");
    vi.stubEnv("LOCAL_MODE", "true");
    expect(isDokobitConfigured()).toBe(true);
  });
});

describe("isFakeDokobit", () => {
  it("is false when a real access token is set", () => {
    expect(isFakeDokobit()).toBe(false);
  });

  it("is false outside LOCAL_MODE, even with no token", () => {
    vi.stubEnv("DOKOBIT_ACCESS_TOKEN", "");
    expect(isFakeDokobit()).toBe(false);
  });

  it("is true in LOCAL_MODE with no token", () => {
    vi.stubEnv("DOKOBIT_ACCESS_TOKEN", "");
    vi.stubEnv("LOCAL_MODE", "true");
    expect(isFakeDokobit()).toBe(true);
  });

  it("stays false in LOCAL_MODE when a token is set, so the sandbox can be tested locally", () => {
    vi.stubEnv("LOCAL_MODE", "true");
    expect(isFakeDokobit()).toBe(false);
  });
});

describe("createSigning on the fake gateway", () => {
  beforeEach(() => {
    vi.mocked(createFakeSigning).mockClear();
    vi.stubEnv("DOKOBIT_ACCESS_TOKEN", "");
    vi.stubEnv("LOCAL_MODE", "true");
  });

  it("hands off to the fake and never touches the network", async () => {
    const result = await createSigning(signingArgs());

    expect(result).toEqual({
      signingToken: "fake-token",
      signingUrl: "http://localhost:3000/fake-dokobit/fake-token",
    });
    expect(calls).toHaveLength(0);
    expect(createFakeSigning).toHaveBeenCalledWith({
      pdf: PDF,
      filename: "Offer_Letter.pdf",
      signingName: "Offer Letter",
      signer: signingArgs().signer,
    });
  });

  it("uses the real gateway instead as soon as a token is set", async () => {
    vi.stubEnv("DOKOBIT_ACCESS_TOKEN", ACCESS_TOKEN);
    responses = happyPath();

    await createSigning(signingArgs());

    expect(createFakeSigning).not.toHaveBeenCalled();
    expect(calls).toHaveLength(3);
  });
});

describe("createSigning", () => {
  it("uploads the file, waits for it, creates the signing and builds the signing URL", async () => {
    responses = happyPath();

    const result = await createSigning(signingArgs());

    expect(result).toEqual({
      signingToken: "signing-token",
      signingUrl:
        "https://gateway-sandbox.dokobit.test/signing/signing-token?access_token=signer-token",
    });

    expect(calls).toHaveLength(3);
    expect(calls[0].url).toBe(
      `https://gateway-sandbox.dokobit.test/api/file/upload.json?access_token=${ACCESS_TOKEN}`
    );
    expect(calls[0].method).toBe("POST");
    expect(calls[1].url).toBe(
      `https://gateway-sandbox.dokobit.test/api/file/upload/file-token/status.json?access_token=${ACCESS_TOKEN}`
    );
    expect(calls[1].method).toBe("GET");
    expect(calls[2].url).toBe(
      `https://gateway-sandbox.dokobit.test/api/signing/create.json?access_token=${ACCESS_TOKEN}`
    );
  });

  it("sends the file as base64 with its SHA256 digest", async () => {
    responses = happyPath();
    await createSigning(signingArgs());

    const upload = calls[0].body!;
    expect(upload.get("file[name]")).toBe("Offer_Letter.pdf");
    expect(upload.get("file[content]")).toBe(PDF.toString("base64"));
    expect(upload.get("file[digest]")).toBe(
      createHash("sha256").update(PDF).digest("hex")
    );
  });

  it("passes the signer's email, which is what makes Dokobit mail the invitation", async () => {
    responses = happyPath();
    await createSigning(signingArgs());

    const create = calls[2].body!;
    expect(create.get("signers[0][id]")).toBe("signer-1");
    expect(create.get("signers[0][email]")).toBe("jonas.petraitis@example.lt");
    expect(create.get("signers[0][name]")).toBe("Jonas");
    expect(create.get("signers[0][surname]")).toBe("Petraitis");
    expect(create.get("signers[0][signing_purpose]")).toBe("signature");
    expect(create.get("files[0][token]")).toBe("file-token");
    expect(create.get("name")).toBe("Offer Letter");
    expect(create.get("type")).toBe("pdf");
    // Defaults to Lithuanian, for both the signing UI and the invitation mail.
    expect(create.get("language")).toBe("lt");
    expect(create.get("signers[0][notifications_language]")).toBe("lt");
  });

  it("honours DOKOBIT_SIGNING_TYPE and DOKOBIT_LANGUAGE", async () => {
    vi.stubEnv("DOKOBIT_SIGNING_TYPE", "pdflt");
    vi.stubEnv("DOKOBIT_LANGUAGE", "en");
    responses = happyPath();
    await createSigning(signingArgs());

    expect(calls[2].body!.get("type")).toBe("pdflt");
    expect(calls[2].body!.get("language")).toBe("en");
  });

  it("keeps polling while the upload is pending", async () => {
    vi.useFakeTimers();
    responses = [
      { body: { status: "ok", token: "file-token" } },
      { body: { status: "pending" } },
      { body: { status: "pending" } },
      { body: { status: "uploaded" } },
      { body: { status: "ok", token: "signing-token", signers: { "signer-1": "signer-token" } } },
    ];

    const promise = createSigning(signingArgs());
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(promise).resolves.toMatchObject({ signingToken: "signing-token" });
    expect(calls).toHaveLength(5);
  });

  it("gives up when the upload never finishes", async () => {
    vi.useFakeTimers();
    responses = [{ body: { status: "ok", token: "file-token" } }];
    // Every poll after the first upload response answers "pending".
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, method: init?.method ?? "GET", body: null });
        const next = responses.shift();
        return new Response(JSON.stringify(next ? next.body : { status: "pending" }));
      })
    );

    const promise = createSigning(signingArgs());
    const assertion = expect(promise).rejects.toThrow(/did not finish storing/);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it("fails when the upload is rejected outright", async () => {
    responses = [
      { body: { status: "ok", token: "file-token" } },
      { body: { status: "failed" } },
    ];
    await expect(createSigning(signingArgs())).rejects.toThrow(
      /could not store the document \(upload status: failed\)/
    );
  });

  it("surfaces per-parameter errors reported by Dokobit", async () => {
    responses = [
      {
        status: 400,
        body: {
          status: "error",
          errors: { "signers[0][email]": ["This value is not a valid email address."] },
        },
      },
    ];
    await expect(createSigning(signingArgs())).rejects.toThrow(
      /signers\[0\]\[email\]: This value is not a valid email address\./
    );
  });

  it("surfaces a top-level error message reported by Dokobit", async () => {
    responses = [{ status: 401, body: { status: "error", message: "Access token is invalid" } }];
    await expect(createSigning(signingArgs())).rejects.toThrow("Access token is invalid");
  });

  it("never leaks the access token in an error message", async () => {
    responses = [{ status: 500, body: { status: "error" } }];
    await expect(createSigning(signingArgs())).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining(ACCESS_TOKEN) as unknown as string,
      })
    );
  });

  it("fails cleanly on a non-JSON response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>502</html>", { status: 502 })));
    await expect(createSigning(signingArgs())).rejects.toThrow(/unreadable response/);
  });

  it("fails cleanly when the network is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    await expect(createSigning(signingArgs())).rejects.toThrow(
      "Could not reach the Dokobit signing service"
    );
  });

  it("fails when Dokobit returns no token for this signer", async () => {
    responses = [
      { body: { status: "ok", token: "file-token" } },
      { body: { status: "uploaded" } },
      { body: { status: "ok", token: "signing-token", signers: { "someone-else": "tok" } } },
    ];
    await expect(createSigning(signingArgs())).rejects.toThrow(
      "Dokobit did not return a signing link for this signer"
    );
  });

  it("refuses to call out at all without an access token", async () => {
    vi.stubEnv("DOKOBIT_ACCESS_TOKEN", "");
    await expect(createSigning(signingArgs())).rejects.toBeInstanceOf(DokobitError);
    expect(calls).toHaveLength(0);
  });

  it("defaults to the production gateway when no API URL is set", async () => {
    vi.stubEnv("DOKOBIT_API_URL", "");
    responses = happyPath();
    const result = await createSigning(signingArgs());
    expect(calls[0].url).toContain("https://gateway.dokobit.com/api/file/upload.json");
    expect(result.signingUrl).toContain("https://gateway.dokobit.com/signing/");
  });
});
