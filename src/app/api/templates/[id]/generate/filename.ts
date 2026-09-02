/** Collapses everything outside `[a-zA-Z0-9-_]` to `_` so a name is safe as a download filename. */
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]+/g, "_");
}
