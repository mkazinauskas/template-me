import { onError, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { SimpleCsrfProtectionHandlerPlugin } from "@orpc/server/plugins";
import { router } from "@/server/orpc/router";

/**
 * Serves {@link router} over oRPC's RPC protocol. Mounted by the Next.js
 * catch-all route at `src/app/api/rpc/[[...rest]]/route.ts`.
 */
export const rpcHandler = new RPCHandler(router, {
  // Session state rides on a cookie, so without this every mutating procedure
  // (templates.delete, templates.setPublic, fillRequests.revoke, ...) would be
  // invocable cross-site: oRPC routes purely on pathname and its codec accepts
  // input from a `?data=` query param, so a plain link/`<img>` on an attacker's
  // page would carry the victim's cookie into a real call. Requiring a custom
  // header can't be forged by a simple cross-site request — a browser must
  // preflight it, and this app sends no CORS headers, so the preflight fails.
  // The matching `SimpleCsrfProtectionLinkPlugin` attaches it in src/lib/orpc.ts.
  plugins: [new SimpleCsrfProtectionHandlerPlugin()],
  interceptors: [
    onError((error) => {
      // Expected client errors (401/404/400/429, thrown as ORPCError) are part
      // of normal operation — only log the unexpected ones so production logs
      // stay signal.
      const isExpectedClientError =
        error instanceof ORPCError && error.status >= 400 && error.status < 500;
      if (!isExpectedClientError) {
        console.error(error);
      }
    }),
  ],
});
