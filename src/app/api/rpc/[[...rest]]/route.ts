// Side-effect import: validates the environment as soon as this route is
// loaded, which is also what makes `next build`'s route-data collection fail
// on a misconfigured build. Belt-and-braces alongside src/instrumentation.ts,
// which validates once per server start.
import "@/lib/env";
import { rpcHandler } from "@/server/orpc/handler";

// The `generate` / `generateBulk` procedures boot a Vercel Sandbox + LibreOffice
// and can convert up to 100 documents in one call, so this route needs the full
// extended function duration rather than the default.
export const maxDuration = 300;

async function handle(request: Request): Promise<Response> {
  const { response } = await rpcHandler.handle(request, {
    prefix: "/api/rpc",
    context: { headers: request.headers },
  });
  return response ?? new Response("Not found", { status: 404 });
}

// Only POST is exported on purpose. oRPC matches procedures by pathname alone
// (the method is never checked), and its codec reads GET input from a `?data=`
// query param — so exporting GET would make every procedure, mutations
// included, reachable by a cross-site navigation or `<img src>`. The typed
// client in src/lib/orpc.ts always POSTs, so nothing legitimate needs GET.
export const POST = handle;
