import { Sandbox } from "@vercel/sandbox";
import { INSTALL_LIBREOFFICE_CMD, LO_VERSION } from "../src/lib/libreoffice-deps";

// A fresh sandbox's fonts/deps go stale the moment LO_DEPS changes, so keep
// snapshots time-boxed rather than permanent (expiration: 0) — each build
// makes a new one anyway, and this bounds how many pile up if snapshot
// creation is ever skipped for a stretch of deployments.
const SNAPSHOT_EXPIRATION_MS = 14 * 24 * 60 * 60 * 1000;

/** Boots a sandbox, installs LibreOffice + fonts, and snapshots it. */
export async function buildLibreOfficeSnapshot(log: (...args: unknown[]) => void = console.log) {
  log("Creating sandbox...");
  const sandbox = await Sandbox.create({ runtime: "node24", timeout: 600_000 });

  try {
    log("Downloading + installing LibreOffice", LO_VERSION);
    const install = await sandbox.runCommand("sh", [
      "-c",
      [
        INSTALL_LIBREOFFICE_CMD,
        "rm -rf /tmp/lo /tmp/lo.tar.gz",
        `ln -sf /opt/libreoffice${LO_VERSION.split(".").slice(0, 2).join(".")}/program/soffice /usr/local/bin/soffice 2>/dev/null || sudo ln -sf /opt/libreoffice${LO_VERSION.split(".").slice(0, 2).join(".")}/program/soffice /usr/local/bin/soffice`,
        "soffice --version",
      ].join(" && "),
    ]);
    log("install exit code:", install.exitCode);
    log(await install.stdout());
    log(await install.stderr());
    if (install.exitCode !== 0) {
      throw new Error("LibreOffice install failed");
    }

    log("Creating snapshot...");
    const snapshot = await sandbox.snapshot({ expiration: SNAPSHOT_EXPIRATION_MS });
    log("Snapshot created:", snapshot.snapshotId);
    return snapshot.snapshotId;
  } finally {
    await sandbox.stop().catch(() => {});
  }
}
