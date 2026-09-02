import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Converts docx buffers to PDF with a `soffice` binary installed directly in the
 * container (see the Dockerfile's `apk add libreoffice`), used instead of the
 * Vercel Sandbox in LOCAL_MODE. Returns PDFs in the same order as `docxBuffers`.
 */
export async function convertWithLocalSoffice(docxBuffers: Buffer[]): Promise<Buffer[]> {
  const dir = await mkdtemp(path.join(tmpdir(), "docx-to-pdf-"));
  try {
    const names = docxBuffers.map((_, i) => `input-${i}.docx`);
    await Promise.all(docxBuffers.map((buffer, i) => writeFile(path.join(dir, names[i]), buffer)));

    try {
      // Use a per-conversion HOME so LibreOffice gets a fresh, writable user
      // profile directory each time. Without this, LO falls back to the process
      // HOME (e.g. /root in the container), which may be read-only or contain a
      // corrupted profile from a previous run, causing garbled PDFs.
      // --norestore prevents LO from trying to resume a previous session.
      await execFileAsync(
        "soffice",
        [
          "--headless",
          "--norestore",
          "--convert-to",
          "pdf",
          "--outdir",
          dir,
          ...names.map((name) => path.join(dir, name)),
        ],
        { timeout: 120_000, env: { ...process.env, HOME: dir } }
      );
    } catch (err) {
      const stderr =
        err && typeof err === "object" && "stderr" in err ? String(err.stderr) : String(err);
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
