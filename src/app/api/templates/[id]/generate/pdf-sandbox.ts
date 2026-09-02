import { after } from "next/server";
import { createPdfSandbox } from "@/lib/docx-to-pdf";

/**
 * Boots the PDF sandbox VM now (when `needed`), in parallel with the blob fetch
 * and docx render that follow, instead of only starting it once conversion is
 * called. `stopIfUnused` shuts that VM down after the response is sent for the
 * code paths that bail out before ever converting.
 */
export function startPdfSandbox(needed: boolean) {
  const sandboxPromise = needed ? createPdfSandbox() : null;
  // Swallow boot errors here; the awaiting conversion call surfaces them.
  sandboxPromise?.catch(() => {});

  const stopIfUnused = () => {
    if (sandboxPromise) {
      after(() => sandboxPromise.then((s) => s?.stop()).catch(() => {}));
    }
  };

  return { sandboxPromise, stopIfUnused };
}
