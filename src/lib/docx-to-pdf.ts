import { Sandbox } from "@vercel/sandbox";
import { after } from "next/server";
import { INSTALL_LIBREOFFICE_CMD } from "./libreoffice-deps";
import { LIBREOFFICE_SNAPSHOT_ID } from "./libreoffice-snapshot.generated";
import { convertWithLocalSoffice } from "./docx-to-pdf/local-soffice";

const LOCAL_MODE = process.env.LOCAL_MODE === "true";

/**
 * Preference order: the snapshot baked into this deployment at build time
 * (see scripts/write-libreoffice-snapshot.ts) — always in sync with the
 * LO_DEPS this same build's soffice invocation expects — then a manual
 * override via env var, then undefined (fresh install fallback).
 */
function snapshotId(): string | undefined {
  return LIBREOFFICE_SNAPSHOT_ID || process.env.LIBREOFFICE_SANDBOX_SNAPSHOT_ID;
}

/**
 * Starts booting the sandbox VM without waiting for it. Callers that also
 * need to fetch/render the docx first can kick this off in parallel via
 * `convertDocxToPdf`'s `sandboxPromise` param, overlapping the ~500ms VM
 * boot with that other work instead of paying for it serially.
 *
 * In LOCAL_MODE there is no sandbox at all — conversion shells out to a
 * `soffice` binary installed directly in the container — so this resolves
 * to `null` and callers must treat the sandbox as optional.
 */
export function createPdfSandbox(): Promise<Sandbox | null> {
  if (LOCAL_MODE) return Promise.resolve(null);
  const id = snapshotId();
  return id
    ? Sandbox.create({ source: { type: "snapshot", snapshotId: id }, timeout: 120_000 })
    : Sandbox.create({ runtime: "node24", timeout: 300_000 });
}

async function ensureLibreOffice(sandbox: Sandbox) {
  if (snapshotId()) return;
  const install = await sandbox.runCommand("sh", ["-c", INSTALL_LIBREOFFICE_CMD]);
  if (install.exitCode !== 0) {
    throw new Error(`Failed to install LibreOffice in sandbox: ${await install.stderr()}`);
  }
}

/**
 * Converts a rendered docx buffer to PDF using a headless LibreOffice inside
 * a Vercel Sandbox microVM (there is no docx->pdf renderer that runs directly
 * in a Node serverless function). When LIBREOFFICE_SANDBOX_SNAPSHOT_ID is set,
 * the sandbox boots from a pre-built snapshot (~1s total); otherwise it
 * installs LibreOffice from scratch (~30-60s), which is only meant as a local
 * fallback for the rare case a build's snapshot regeneration failed (see
 * scripts/write-libreoffice-snapshot.ts) and no override is set.
 *
 * Pass `sandboxPromise` (e.g. from `createPdfSandbox()`) to start the VM
 * before the docx is ready; if the caller ends up not calling this at all,
 * it is on them to stop that sandbox.
 */
export async function convertDocxToPdf(
  docxBuffer: Buffer,
  sandboxPromise: Promise<Sandbox | null> = createPdfSandbox()
): Promise<Buffer> {
  if (LOCAL_MODE) {
    const [pdfBuffer] = await convertWithLocalSoffice([docxBuffer]);
    return pdfBuffer;
  }

  const sandbox = await sandboxPromise;
  if (!sandbox) throw new Error("No PDF sandbox available");
  const stopSandbox = () => sandbox.stop().catch(() => {});

  try {
    await ensureLibreOffice(sandbox);

    await sandbox.writeFiles([{ path: "input.docx", content: docxBuffer }]);

    const convert = await sandbox.runCommand("sh", [
      "-c",
      "HOME=/tmp soffice --headless --convert-to pdf --outdir /vercel/sandbox /vercel/sandbox/input.docx 2>&1",
    ]);
    if (convert.exitCode !== 0) {
      throw new Error(`soffice conversion failed: ${await convert.stdout()}`);
    }

    const pdfBuffer = await sandbox.readFileToBuffer({ path: "/vercel/sandbox/input.pdf" });
    if (!pdfBuffer) {
      throw new Error("Conversion produced no output PDF");
    }

    // Stopping the VM takes ~10s on its own; shutting it down after the
    // response is sent (instead of awaiting it here) is what actually makes
    // this fast for the caller.
    after(stopSandbox);
    return pdfBuffer;
  } catch (err) {
    await stopSandbox();
    throw err;
  }
}

/**
 * Converts many rendered docx buffers to PDF in one LibreOffice invocation
 * (a single `soffice --convert-to` call given all input files), which is
 * far cheaper than booting/converting one at a time for bulk generation.
 * Returns PDFs in the same order as `docxBuffers`.
 */
export async function convertDocxBuffersToPdf(
  docxBuffers: Buffer[],
  sandboxPromise: Promise<Sandbox | null> = createPdfSandbox()
): Promise<Buffer[]> {
  if (LOCAL_MODE) {
    return convertWithLocalSoffice(docxBuffers);
  }

  const sandbox = await sandboxPromise;
  if (!sandbox) throw new Error("No PDF sandbox available");
  const stopSandbox = () => sandbox.stop().catch(() => {});

  try {
    await ensureLibreOffice(sandbox);

    const names = docxBuffers.map((_, i) => `input-${i}.docx`);
    await sandbox.writeFiles(
      docxBuffers.map((content, i) => ({ path: names[i], content }))
    );

    const inputPaths = names.map((name) => `/vercel/sandbox/${name}`).join(" ");
    const convert = await sandbox.runCommand("sh", [
      "-c",
      `HOME=/tmp soffice --headless --convert-to pdf --outdir /vercel/sandbox ${inputPaths} 2>&1`,
    ]);
    if (convert.exitCode !== 0) {
      throw new Error(`soffice conversion failed: ${await convert.stdout()}`);
    }

    const pdfBuffers = await Promise.all(
      names.map(async (name, i) => {
        const pdfPath = `/vercel/sandbox/${name.replace(/\.docx$/, ".pdf")}`;
        const buffer = await sandbox.readFileToBuffer({ path: pdfPath });
        if (!buffer) {
          throw new Error(`Conversion produced no output PDF for document ${i + 1}`);
        }
        return buffer;
      })
    );

    after(stopSandbox);
    return pdfBuffers;
  } catch (err) {
    await stopSandbox();
    throw err;
  }
}
