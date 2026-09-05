import type PizZip from "pizzip";

/**
 * Cap on the total *uncompressed* size of a docx's zip entries — guards against
 * a "zip bomb" (a small upload that decompresses into something huge enough to
 * OOM the process) since docxtemplater/PizZip fully decompress entries into
 * memory when reading text or rendering.
 */
const MAX_UNCOMPRESSED_ZIP_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Cap on the number of entries in the zip's central directory. A crafted zip
 * can hold many thousands of tiny/empty entries while staying under both the
 * upload size cap and `MAX_UNCOMPRESSED_ZIP_BYTES` — bounding the count keeps
 * parsing overhead predictable regardless of entry sizes.
 */
const MAX_ZIP_ENTRIES = 2000;

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
  const entryPaths = Object.keys(zip.files);
  if (entryPaths.length > MAX_ZIP_ENTRIES) {
    throw new Error("Document contains too many parts to process");
  }

  let total = 0;
  for (const relativePath of entryPaths) {
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
 * Rejects docx content that can make the PDF converter (headless LibreOffice)
 * fetch an attacker-chosen URL during conversion — an SSRF primitive, since
 * `generate`/`generateBulk` are reachable by anyone who can view a template
 * (including anonymous visitors, for public templates). There's no legitimate
 * need for these in a form-fill template:
 *
 * - `INCLUDEPICTURE`/`INCLUDETEXT` field codes can point at an arbitrary
 *   `http(s)://` URL that LibreOffice fetches on render.
 * - `<w:altChunk>` embeds another document part, which can itself be sourced
 *   from an external relationship.
 * - A `attachedTemplate` relationship with `TargetMode="External"` points
 *   Word/LibreOffice at a remote `.dotx` to merge styles from.
 */
export function assertNoExternalContentReferences(zip: PizZip): void {
  for (const relativePath of Object.keys(zip.files)) {
    const entry = zip.files[relativePath];
    if (entry.dir) continue;

    if (/^word\/.*\.xml$/.test(relativePath)) {
      const xml = entry.asText();
      if (/INCLUDEPICTURE|INCLUDETEXT/i.test(xml)) {
        throw new Error(
          "Document contains an external field code (INCLUDEPICTURE/INCLUDETEXT), which isn't supported"
        );
      }
      if (/<w:altChunk\b/i.test(xml)) {
        throw new Error(
          "Document contains an embedded external document chunk, which isn't supported"
        );
      }
    }

    if (/(^|\/)_rels\/.*\.rels$/.test(relativePath)) {
      const xml = entry.asText();
      const relationshipTags = xml.match(/<Relationship\b[^>]*\/>/g) ?? [];
      for (const tag of relationshipTags) {
        if (/Type="[^"]*attachedTemplate"/i.test(tag) && /TargetMode="External"/i.test(tag)) {
          throw new Error(
            "Document references an external attached template, which isn't supported"
          );
        }
      }
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
