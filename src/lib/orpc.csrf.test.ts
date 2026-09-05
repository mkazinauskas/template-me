// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The browser client and the RPC handler are two halves of one CSRF scheme:
 * the handler rejects any request without the header
 * (`SimpleCsrfProtectionHandlerPlugin`, see src/server/orpc/handler.ts) and the
 * client is what attaches it. Dropping the client half wouldn't fail to compile
 * or fail any router test — it would just 403 every call in production — so
 * pin the header actually going out on the wire.
 */
describe("orpc browser client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("attaches the CSRF header the RPC handler requires", async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ json: { templates: [] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { orpc } = await import("@/lib/orpc");
    await orpc.templates.list();

    const [request] = fetchSpy.mock.calls[0] as unknown as [Request];
    expect(request.headers.get("x-csrf-token")).toBe("orpc");
    // A cross-site request can't pick the method either — see the route, which
    // exports POST only.
    expect(request.method).toBe("POST");
  });
});
