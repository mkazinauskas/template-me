import { Sandbox } from "@vercel/sandbox";

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
  // opened in Word. Keep this list in sync with src/lib/docx-to-pdf.ts.
  "liberation-fonts-all",
  "google-carlito-fonts",
  "google-crosextra-caladea-fonts",
];

async function main() {
  console.log("Creating sandbox...");
  const sandbox = await Sandbox.create({ runtime: "node24", timeout: 600_000 });

  try {
    console.log("Downloading + installing LibreOffice", LO_VERSION);
    const install = await sandbox.runCommand("sh", [
      "-c",
      [
        "cd /tmp",
        `curl -sL -o lo.tar.gz https://download.documentfoundation.org/libreoffice/stable/${LO_VERSION}/rpm/x86_64/LibreOffice_${LO_VERSION}_Linux_x86-64_rpm.tar.gz`,
        "mkdir -p lo",
        "tar xzf lo.tar.gz -C lo --strip-components=1",
        "cd lo/RPMS",
        "sudo dnf install -y ./*.rpm",
        `sudo dnf install -y ${LO_DEPS.join(" ")}`,
        "rm -rf /tmp/lo /tmp/lo.tar.gz",
        `ln -sf /opt/libreoffice${LO_VERSION.split(".").slice(0, 2).join(".")}/program/soffice /usr/local/bin/soffice 2>/dev/null || sudo ln -sf /opt/libreoffice${LO_VERSION.split(".").slice(0, 2).join(".")}/program/soffice /usr/local/bin/soffice`,
        "soffice --version",
      ].join(" && "),
    ]);
    console.log("exit:", install.exitCode);
    console.log(await install.stdout());
    console.log(await install.stderr());
    if (install.exitCode !== 0) {
      throw new Error("LibreOffice install failed");
    }

    console.log("Creating snapshot...");
    const snapshot = await sandbox.snapshot({ expiration: 0 });
    console.log("Snapshot created:", snapshot.snapshotId);
    console.log(`\nSet this in your environment:\nLIBREOFFICE_SANDBOX_SNAPSHOT_ID=${snapshot.snapshotId}\n`);
  } finally {
    await sandbox.stop().catch(() => {});
  }
}

main().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
