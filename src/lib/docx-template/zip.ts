import type PizZip from "pizzip";

/**
 * Cap on the total *uncompressed* size of a docx's zip entries — guards against
 * a "zip bomb" (a small upload that decompresses into something huge enough to
 * OOM the process) since docxtemplater/PizZip fully decompress entries into
 * memory when reading text or rendering.
 */
const MAX_UNCOMPRESSED_ZIP_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Sums each zip entry's uncompressed size straight from the zip's central
 * directory metadata (populated by PizZip while parsing the archive structure)
 * and rejects if the total is implausibly large — without ever decompressing
 * entry contents to measure them, which would itself be the OOM risk this is
 * meant to prevent.
 *
 * `_data.uncompressedSize` isn't part of PizZip's public TypeScript surface, but
 * is populated on every non-directory `ZipObject` as soon as the archive is
 * loaded (see pizzip's zipEntry.js / object.js) — reading it here is safe and
 * doesn't trigger decompression.
 */
export function assertSafeUncompressedSize(zip: PizZip): void {
  let total = 0;
  for (const relativePath of Object.keys(zip.files)) {
    const entry = zip.files[relativePath];
    if (entry.dir) continue;
    const uncompressedSize =
      (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
    total += uncompressedSize;
    if (total > MAX_UNCOMPRESSED_ZIP_BYTES) {
      throw new Error("Document contents are too large to process");
    }
  }
}

/**
 * Rewrites the WordprocessingML parts to fix two things a Google Docs export
 * does that Word tolerates but headless LibreOffice (our docx->PDF converter)
 * mangles:
 *
 * - Fractional twip measurements (`<w:pgMar w:top="850.393..."/>`,
 *   `<w:tblW w:w="9315.0"/>`, ...). LibreOffice drops the whole attribute; a
 *   lost `<w:pgMar>` falls back to a huge margin, giving a blank first page.
 *   Every such value is twips/twentieths-of-a-point, so rounding is sub-pixel.
 * - Floating tables (`<w:tblpPr>`). Word flows them across pages; LibreOffice
 *   pins the table to its one anchor point, collapsing every row of a
 *   multi-page table onto page 1. Stripping the positioning (and the
 *   paragraph-level `<w:framePr>`) makes them inline again.
 */
export function sanitizeForLibreOffice(zip: PizZip): void {
  for (const relativePath of Object.keys(zip.files)) {
    if (!/^word\/.*\.xml$/.test(relativePath)) continue;
    const entry = zip.files[relativePath];
    if (entry.dir) continue;
    const xml = entry.asText();
    const sanitized = xml
      .replace(
        /(\sw:[A-Za-z]+=")(-?\d+\.\d+)(")/g,
        (_, before, num, after) => `${before}${Math.round(parseFloat(num))}${after}`
      )
      .replace(/<w:tblpPr\b[^>]*\/>/g, "")
      .replace(/<w:framePr\b[^>]*\/>/g, "");
    if (sanitized !== xml) zip.file(relativePath, sanitized);
  }
}
