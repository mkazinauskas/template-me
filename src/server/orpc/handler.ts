import { onError, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { router } from "@/server/orpc/router";

/**
 * Serves {@link router} over oRPC's RPC protocol. Mounted by the Next.js
 * catch-all route at `src/app/api/rpc/[[...rest]]/route.ts`.
 */
export const rpcHandler = new RPCHandler(router, {
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
