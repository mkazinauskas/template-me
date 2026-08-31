// Manual entry point for building a LibreOffice sandbox snapshot from your
// own machine — e.g. to test a LO_DEPS change locally before it hits a
// Vercel build, which now regenerates the snapshot automatically (see
// scripts/write-libreoffice-snapshot.ts and the "vercel-build" npm script).
import { buildLibreOfficeSnapshot } from "./build-libreoffice-snapshot";

buildLibreOfficeSnapshot()
  .then((snapshotId) => {
    console.log(
      `\nTo pin the app to this snapshot instead of the one generated at build time, set:\nLIBREOFFICE_SANDBOX_SNAPSHOT_ID=${snapshotId}\n`
    );
  })
  .catch((e) => {
    console.error("FAILED", e);
    process.exit(1);
  });
