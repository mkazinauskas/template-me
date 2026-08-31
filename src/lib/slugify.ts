/**
 * Turns a display name into a filesystem-safe filename fragment, e.g. for a
 * downloaded document's `<a download>` name. Client-side only — the server
 * routes that generate the actual files keep their own copy of this logic.
 */
export function slugifyFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]+/g, "_");
}
