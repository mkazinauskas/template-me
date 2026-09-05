// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeTemplate,
  mockTemplatesRouterDeps,
  resetState,
  state,
} from "@/server/orpc/routers/templates.test-helpers";

mockTemplatesRouterDeps();

async function importPost() {
  const { POST } = await import("./route");
  return POST;
}

/**
 * Builds an oRPC RPC-protocol request for `procedure` (dot path) with `input`.
 * `x-csrf-token` is what `SimpleCsrfProtectionHandlerPlugin` requires; the real
 * client attaches it via `SimpleCsrfProtectionLinkPlugin` (src/lib/orpc.ts).
 */
function rpcRequest(procedure: string, input: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/rpc/${procedure.replace(/\./g, "/")}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": "orpc", ...headers },
    body: JSON.stringify({ json: input }),
  });
}

describe("POST /api/rpc/[[...rest]]", () => {
  beforeEach(resetState);
  afterEach(() => vi.restoreAllMocks());

  it("routes an authenticated call through the router and returns its result", async () => {
    state.rows = [makeTemplate({ name: "Offer Letter" })];
    const POST = await importPost();

    const res = await POST(rpcRequest("templates.list", {}));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.json.templates[0].name).toBe("Offer Letter");
  });

  it("maps an expected client error to its HTTP status without logging it", async () => {
    state.session = null;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const POST = await importPost();

    const res = await POST(rpcRequest("templates.list", {}));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.json.code).toBe("UNAUTHORIZED");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("logs an unexpected (5xx) error", async () => {
    state.rows = [makeTemplate()];
    state.storedFiles = {};
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const POST = await importPost();

    const res = await POST(rpcRequest("templates.download", { id: "t1" }));

    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns 404 for a path that is not a known procedure", async () => {
    const POST = await importPost();

    const res = await POST(rpcRequest("templates.nope", {}));

    expect(res.status).toBe(404);
  });

  it("rejects a request that is missing the CSRF header", async () => {
    state.rows = [makeTemplate()];
    const POST = await importPost();

    const res = await POST(
      new Request("http://localhost/api/rpc/templates/list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: {} }),
      })
    );

    expect(res.status).toBe(403);
  });

  it("exports no GET handler, so no procedure is reachable by cross-site navigation", async () => {
    const route = await import("./route");

    expect("GET" in route).toBe(false);
  });
});
