import { Sandbox } from "@vercel/sandbox";
import { after } from "next/server";

const LO_VERSION = "26.8.0";
const LO_DEPS = [
  "libXinerama",
  "libXrender",
  "libSM",
  "libICE",
  "cairo",
  "cups-libs",
  "mesa-libGL",
  "dbus-libs",
  "nss",
  "nspr",
];

const INSTALL_LIBREOFFICE_CMD = [
  "cd /tmp",
  `curl -sL -o lo.tar.gz https://download.documentfoundation.org/libreoffice/stable/${LO_VERSION}/rpm/x86_64/LibreOffice_${LO_VERSION}_Linux_x86-64_rpm.tar.gz`,
  "mkdir -p lo",
  "tar xzf lo.tar.gz -C lo --strip-components=1",
  "cd lo/RPMS",
  "sudo dnf install -y ./*.rpm",
  `sudo dnf install -y ${LO_DEPS.join(" ")}`,
].join(" && ");

/**
 * Starts booting the sandbox VM without waiting for it. Callers that also
 * need to fetch/render the docx first can kick this off in parallel via
 * `convertDocxToPdf`'s `sandboxPromise` param, overlapping the ~500ms VM
 * boot with that other work instead of paying for it serially.
 */
export function createPdfSandbox(): Promise<Sandbox> {
  const snapshotId = process.env.LIBREOFFICE_SANDBOX_SNAPSHOT_ID;
  return snapshotId
    ? Sandbox.create({ source: { type: "snapshot", snapshotId }, timeout: 120_000 })
    : Sandbox.create({ runtime: "node24", timeout: 300_000 });
}

async function ensureLibreOffice(sandbox: Sandbox) {
  if (process.env.LIBREOFFICE_SANDBOX_SNAPSHOT_ID) return;
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
 * fallback before a snapshot has been created via
 * scripts/create-libreoffice-snapshot.ts.
 *
 * Pass `sandboxPromise` (e.g. from `createPdfSandbox()`) to start the VM
 * before the docx is ready; if the caller ends up not calling this at all,
 * it is on them to stop that sandbox.
 */
export async function convertDocxToPdf(
  docxBuffer: Buffer,
  sandboxPromise: Promise<Sandbox> = createPdfSandbox()
): Promise<Buffer> {
  const sandbox = await sandboxPromise;
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
  sandboxPromise: Promise<Sandbox> = createPdfSandbox()
): Promise<Buffer[]> {
  const sandbox = await sandboxPromise;
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
