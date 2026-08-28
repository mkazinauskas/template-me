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
 * Converts a rendered docx buffer to PDF using a headless LibreOffice inside
 * a Vercel Sandbox microVM (there is no docx->pdf renderer that runs directly
 * in a Node serverless function). When LIBREOFFICE_SANDBOX_SNAPSHOT_ID is set,
 * the sandbox boots from a pre-built snapshot (~1s total); otherwise it
 * installs LibreOffice from scratch (~30-60s), which is only meant as a local
 * fallback before a snapshot has been created via
 * scripts/create-libreoffice-snapshot.ts.
 */
export async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const snapshotId = process.env.LIBREOFFICE_SANDBOX_SNAPSHOT_ID;

  const sandbox = snapshotId
    ? await Sandbox.create({ source: { type: "snapshot", snapshotId }, timeout: 120_000 })
    : await Sandbox.create({ runtime: "node24", timeout: 300_000 });

  const stopSandbox = () => sandbox.stop().catch(() => {});

  try {
    if (!snapshotId) {
      const install = await sandbox.runCommand("sh", ["-c", INSTALL_LIBREOFFICE_CMD]);
      if (install.exitCode !== 0) {
        throw new Error(`Failed to install LibreOffice in sandbox: ${await install.stderr()}`);
      }
    }

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
