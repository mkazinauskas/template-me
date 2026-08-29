import { del as blobDel, get as blobGet, put as blobPut } from "@vercel/blob";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const LOCAL_MODE = process.env.LOCAL_MODE === "true";
const LOCAL_STORAGE_DIR = process.env.LOCAL_STORAGE_DIR || "/data/blobs";
const LOCAL_URL_PREFIX = "local://";

export type StoredFile = { url: string; pathname: string };

function localPath(pathname: string) {
  return path.join(LOCAL_STORAGE_DIR, pathname);
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
      return await readFile(localPath(url.slice(LOCAL_URL_PREFIX.length)));
    } catch {
      return null;
    }
  }
  const blobFile = await blobGet(url, { access: "private" });
  if (!blobFile || blobFile.statusCode !== 200) return null;
  return Buffer.from(await new Response(blobFile.stream).arrayBuffer());
}

export async function deleteFile(url: string): Promise<void> {
  if (LOCAL_MODE) {
    await rm(localPath(url.slice(LOCAL_URL_PREFIX.length)), { force: true });
    return;
  }
  await blobDel(url).catch(() => {});
}
