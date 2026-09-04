import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { router } from "@/server/orpc/router";

/**
 * Typed browser client for the app's oRPC API (see `src/server/orpc/router.ts`).
 * Use this instead of `fetch` from client components — renaming or reshaping a
 * procedure on the server becomes a compile error here.
 *
 * The module is only imported from `"use client"` components, but its top-level
 * code still runs once during SSR, so `url` is resolved lazily per call rather
 * than reading `window` at module load.
 */
const link = new RPCLink({
  url: () =>
    typeof window === "undefined"
      ? "http://localhost/api/rpc"
      : `${window.location.origin}/api/rpc`,
});

export const orpc: RouterClient<typeof router> = createORPCClient(link);

export { ORPCError };

/**
 * Extracts a user-facing message from a failed oRPC call. Server-thrown
 * `ORPCError`s carry a message meant for display; transport failures surface as
 * a plain `Error` whose message is still more useful than a generic string.
 * Anything else (or an empty message) falls back to `fallback`.
 */
export function orpcErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
