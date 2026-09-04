// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state: {
  session: { user: { id: string; email: string } } | null;
} = {
  session: { user: { id: "user-1", email: "owner@example.com" } },
};

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: () => Promise.resolve(state.session) } },
}));

vi.mock("@vercel/blob/client", () => ({
  handleUpload: vi.fn(
    async ({
      body,
      onBeforeGenerateToken,
    }: {
      body: { payload: { pathname: string; clientPayload: string | null; multipart: boolean } };
      onBeforeGenerateToken: (
        pathname: string,
        clientPayload: string | null,
        multipart: boolean
      ) => Promise<unknown>;
    }) => {
      const tokenOptions = await onBeforeGenerateToken(
        body.payload.pathname,
        body.payload.clientPayload,
        body.payload.multipart
      );
      return { type: "blob.generate-client-token", clientToken: JSON.stringify(tokenOptions) };
    }
  ),
}));

function tokenRequest(pathname: string) {
  return new NextRequest("http://localhost/api/templates/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "blob.generate-client-token",
      payload: { pathname, clientPayload: null, multipart: false },
    }),
  });
}

describe("POST /api/templates/upload", () => {
  beforeEach(() => {
    state.session = { user: { id: "user-1", email: "owner@example.com" } };
  });

  it("returns 400 when there is no session", async () => {
    state.session = null;
    const { POST } = await import("./route");

    const res = await POST(tokenRequest("templates/uuid-offer.docx"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Unauthorized");
  });

  it("rejects a pathname outside the templates/ prefix", async () => {
    const { POST } = await import("./route");

    const res = await POST(tokenRequest("other/uuid-offer.docx"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Invalid upload path");
  });

  it("issues a client token constrained to the docx content type and size cap", async () => {
    const { POST } = await import("./route");

    const res = await POST(tokenRequest("templates/uuid-offer.docx"));
    const json = await res.json();

    expect(res.status).toBe(200);
    const tokenOptions = JSON.parse(json.clientToken);
    expect(tokenOptions.allowedContentTypes).toEqual([
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);
    expect(tokenOptions.maximumSizeInBytes).toBe(10 * 1024 * 1024);
    expect(tokenOptions.addRandomSuffix).toBe(true);
  });
});
