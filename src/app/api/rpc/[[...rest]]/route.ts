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

export const GET = handle;
export const POST = handle;
