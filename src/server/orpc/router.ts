import { templatesRouter } from "@/server/orpc/routers/templates";
import { fillRequestsRouter } from "@/server/orpc/routers/fill-requests";

/**
 * The application's entire API surface. Every endpoint the browser calls is a
 * procedure here, reached through the typed client in `src/lib/orpc.ts` and
 * served by the catch-all handler at `src/app/api/rpc/[[...rest]]/route.ts`.
 *
 * The two remaining plain route handlers — `/api/auth/[...all]` (better-auth)
 * and `/api/templates/upload` (Vercel Blob client-upload token exchange) —
 * implement third-party wire protocols and are intentionally not oRPC.
 */
export const router = {
  templates: templatesRouter,
  fillRequests: fillRequestsRouter,
};

export type AppRouter = typeof router;
