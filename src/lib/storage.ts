import {
  del as blobDel,
  get as blobGet,
  head as blobHead,
  put as blobPut,
} from "@vercel/blob";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const LOCAL_MODE = process.env.LOCAL_MODE === "true";
const LOCAL_STORAGE_DIR = process.env.LOCAL_STORAGE_DIR || "/data/blobs";
const LOCAL_URL_PREFIX = "local://";

export type StoredFile = { url: string; pathname: string };

function localPath(pathname: string) {
  // LOCAL_STORAGE_DIR only varies at runtime (an env var, not a literal), so
  // Turbopack can't scope this statically — it would otherwise trace and
  // bundle the entire project as a precaution. This path is never used in
  // production (only when LOCAL_MODE is set for local Docker Compose), so
  // that tracing buys nothing.
  const resolved = path.resolve(/* turbopackIgnore: true */ LOCAL_STORAGE_DIR, pathname);
  // `path.join`/`resolve` happily walk out of the base directory when given a
  // pathname containing `..`, which would turn any caller that builds a
  // pathname from user input into an arbitrary file read/write. Callers are
  // expected to sanitize, but this is the last line before the filesystem, so
  // it refuses to hand back anything outside the storage root regardless.
  const root = path.resolve(LOCAL_STORAGE_DIR);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Invalid storage path");
  }
  return resolved;
}

/**
 * Stores a file under `pathname` and returns an opaque `url` used later to
 * fetch or delete it via `getFile`/`deleteFile`. Only server code ever reads
 * this url, so in local mode it's just a `local://` marker around the
 * pathname rather than something a browser could fetch.
 */
export async function putFile(
  pathname: string,
  buffer: Buffer,
  contentType: string
): Promise<StoredFile> {
  if (LOCAL_MODE) {
    const filePath = localPath(pathname);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    return { url: `${LOCAL_URL_PREFIX}${pathname}`, pathname };
  }
  const blob = await blobPut(pathname, buffer, { access: "private", contentType });
  return { url: blob.url, pathname: blob.pathname };
}

export async function getFile(url: string): Promise<Buffer | null> {
  if (LOCAL_MODE) {
    try {
      return await readFile(/* turbopackIgnore: true */ localPath(url.slice(LOCAL_URL_PREFIX.length)));
    } catch {
      return null;
    }
  }
  const blobFile = await blobGet(url, { access: "private" });
  if (!blobFile || blobFile.statusCode !== 200) return null;
  return Buffer.from(await new Response(blobFile.stream).arrayBuffer());
}

/**
 * Reports what is actually stored at `url` — the authoritative pathname and
 * size — or `null` if nothing is. Lets a caller that was handed a url *and* a
 * claimed pathname by a client verify the two agree, instead of trusting the
 * claim (see `createFromBlob` in the templates router).
 */
export async function statFile(
  url: string
): Promise<{ pathname: string; size: number } | null> {
  if (LOCAL_MODE) {
    const pathname = url.slice(LOCAL_URL_PREFIX.length);
    try {
      const stats = await stat(/* turbopackIgnore: true */ localPath(pathname));
      return { pathname, size: stats.size };
    } catch {
      return null;
    }
  }
  try {
    const blobFile = await blobHead(url);
    return { pathname: blobFile.pathname, size: blobFile.size };
  } catch {
    return null;
  }
}

export async function deleteFile(url: string): Promise<void> {
  if (LOCAL_MODE) {
    await rm(localPath(url.slice(LOCAL_URL_PREFIX.length)), { force: true });
    return;
  }
  await blobDel(url).catch(() => {});
}
