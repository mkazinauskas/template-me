// Shared between the runtime conversion path (docx-to-pdf.ts) and the
// snapshot-building scripts (scripts/*-libreoffice-snapshot.ts) so the
// installed LibreOffice version and dependencies can never drift between
// "what a fresh install would get" and "what's baked into the snapshot".

export const LO_VERSION = "26.8.0";

export const LO_DEPS = [
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

export const INSTALL_LIBREOFFICE_CMD = [
  "cd /tmp",
  `curl -sL -o lo.tar.gz https://download.documentfoundation.org/libreoffice/stable/${LO_VERSION}/rpm/x86_64/LibreOffice_${LO_VERSION}_Linux_x86-64_rpm.tar.gz`,
  "mkdir -p lo",
  "tar xzf lo.tar.gz -C lo --strip-components=1",
  "cd lo/RPMS",
  "sudo dnf install -y ./*.rpm",
  `sudo dnf install -y ${LO_DEPS.join(" ")}`,
].join(" && ");
