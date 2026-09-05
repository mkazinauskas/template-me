import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { isFakeDokobit } from "@/lib/dokobit";
import { readFakeSigningPdf, signFakeSigning } from "@/lib/dokobit/fake";
import { publicProcedure } from "@/server/orpc/base";

/**
 * Backs the dev-only simulated signing page at `/fake-dokobit/[token]` (see
 * `@/lib/dokobit/fake`). Every procedure refuses outright unless the app is
 * running on the fake gateway, so this router is inert — indistinguishable
 * from a route that doesn't exist — in any real deployment.
 *
 * Deliberately public: the real signing link goes to an outside party who has
 * no account here, and the fake stands in for exactly that. There's no `get`
 * here because the page reads the signing's metadata server-side and passes it
 * down as props.
 */

const NOT_FOUND = "Signing not found";

function assertFakeMode(): void {
  if (!isFakeDokobit()) {
    throw new ORPCError("NOT_FOUND", { message: NOT_FOUND });
  }
}

const tokenInput = z.object({ token: z.string().min(1).max(64) });

export const fakeDokobitRouter = {
  /** The stored PDF, for the preview pane on the signing page. */
  download: publicProcedure.input(tokenInput).handler(async ({ input }) => {
    assertFakeMode();
    const pdf = await readFakeSigningPdf(input.token);
    if (!pdf) {
      throw new ORPCError("NOT_FOUND", { message: NOT_FOUND });
    }
    return new File([new Uint8Array(pdf)], `${input.token}.pdf`, {
      type: "application/pdf",
    });
  }),

  /** Simulates the signature. Signing twice is a no-op, not an error. */
  sign: publicProcedure.input(tokenInput).handler(async ({ input }) => {
    assertFakeMode();
    const signing = await signFakeSigning(input.token);
    if (!signing) {
      throw new ORPCError("NOT_FOUND", { message: NOT_FOUND });
    }
    return { signing };
  }),
};
