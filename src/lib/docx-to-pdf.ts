import { Sandbox } from "@vercel/sandbox";
import { after } from "next/server";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const LOCAL_MODE = process.env.LOCAL_MODE === "true";

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
  // Broad-coverage fallback font: without it, glyphs Times New Roman lacks
  // (e.g. Lithuanian/Baltic ogonek letters į, ų) render as tofu boxes.
  "google-noto-sans-fonts",
  // Metric-compatible replacements for the fonts most .docx templates
  // actually use (Arial/Times New Roman/Courier New, Calibri, Cambria).
  // Without these LibreOffice substitutes a font with different glyph
  // widths, so the PDF wraps/paginates differently than the same document
  // opened in Word.
  "liberation-fonts-all",
  "google-carlito-fonts",
  "google-crosextra-caladea-fonts",
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
 *
 * In LOCAL_MODE there is no sandbox at all — conversion shells out to a
 * `soffice` binary installed directly in the container — so this resolves
 * to `null` and callers must treat the sandbox as optional.
 */
export function createPdfSandbox(): Promise<Sandbox | null> {
  if (LOCAL_MODE) return Promise.resolve(null);
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
 * Converts docx buffers to PDF with a `soffice` binary installed directly in
 * the container (see the Dockerfile's `apk add libreoffice`), used instead
 * of the Vercel Sandbox in LOCAL_MODE. Returns PDFs in the same order as
 * `docxBuffers`.
 */
async function convertLocally(docxBuffers: Buffer[]): Promise<Buffer[]> {
  const dir = await mkdtemp(path.join(tmpdir(), "docx-to-pdf-"));
  try {
    const names = docxBuffers.map((_, i) => `input-${i}.docx`);
    await Promise.all(
      docxBuffers.map((buffer, i) => writeFile(path.join(dir, names[i]), buffer))
    );

    try {
      await execFileAsync(
        "soffice",
        ["--headless", "--convert-to", "pdf", "--outdir", dir, ...names.map((name) => path.join(dir, name))],
        { timeout: 120_000 }
      );
    } catch (err) {
      const stderr = err && typeof err === "object" && "stderr" in err ? String(err.stderr) : String(err);
      throw new Error(`soffice conversion failed: ${stderr}`);
    }

    return await Promise.all(
      names.map(async (name, i) => {
        try {
          return await readFile(path.join(dir, name.replace(/\.docx$/, ".pdf")));
        } catch {
          throw new Error(`Conversion produced no output PDF for document ${i + 1}`);
        }
      })
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
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
  sandboxPromise: Promise<Sandbox | null> = createPdfSandbox()
): Promise<Buffer> {
  if (LOCAL_MODE) {
    const [pdfBuffer] = await convertLocally([docxBuffer]);
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
    return convertLocally(docxBuffers);
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
