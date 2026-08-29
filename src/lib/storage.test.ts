import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const blobPut = vi.fn();
const blobGet = vi.fn();
const blobDel = vi.fn();

vi.mock("@vercel/blob", () => ({
  put: (...args: unknown[]) => blobPut(...args),
  get: (...args: unknown[]) => blobGet(...args),
  del: (...args: unknown[]) => blobDel(...args),
}));

describe("storage", () => {
  const originalEnv = { ...process.env };
  let dir: string;

  beforeEach(async () => {
    vi.resetModules();
    blobPut.mockReset();
    blobGet.mockReset();
    blobDel.mockReset();
    dir = await mkdtemp(path.join(tmpdir(), "storage-test-"));
    process.env = { ...originalEnv, LOCAL_MODE: "false", LOCAL_STORAGE_DIR: dir };
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    await rm(dir, { recursive: true, force: true });
  });

  describe("vercel blob mode", () => {
    it("putFile delegates to @vercel/blob put and returns its url/pathname", async () => {
      blobPut.mockResolvedValue({ url: "https://blob.example/t/a.docx", pathname: "t/a.docx" });
      const { putFile } = await import("@/lib/storage");

      const result = await putFile("t/a.docx", Buffer.from("hi"), "text/plain");

      expect(blobPut).toHaveBeenCalledWith("t/a.docx", Buffer.from("hi"), {
        access: "private",
        contentType: "text/plain",
      });
      expect(result).toEqual({ url: "https://blob.example/t/a.docx", pathname: "t/a.docx" });
    });

    it("getFile returns the buffered stream contents on a 200", async () => {
      blobGet.mockResolvedValue({ statusCode: 200, stream: new Response("hello").body });
      const { getFile } = await import("@/lib/storage");

      const result = await getFile("https://blob.example/t/a.docx");

      expect(result?.toString()).toBe("hello");
    });

    it("getFile returns null when the blob is missing", async () => {
      blobGet.mockResolvedValue(undefined);
      const { getFile } = await import("@/lib/storage");

      expect(await getFile("https://blob.example/missing.docx")).toBeNull();
    });

    it("deleteFile delegates to @vercel/blob del and swallows errors", async () => {
      blobDel.mockRejectedValue(new Error("boom"));
      const { deleteFile } = await import("@/lib/storage");

      await expect(deleteFile("https://blob.example/t/a.docx")).resolves.toBeUndefined();
      expect(blobDel).toHaveBeenCalledWith("https://blob.example/t/a.docx");
    });
  });

  describe("local mode", () => {
    beforeEach(() => {
      process.env.LOCAL_MODE = "true";
    });

    it("putFile writes the file to disk under LOCAL_STORAGE_DIR and returns a local:// url", async () => {
      const { putFile } = await import("@/lib/storage");

      const result = await putFile("templates/a.docx", Buffer.from("hello"), "text/plain");

      expect(result).toEqual({ url: "local://templates/a.docx", pathname: "templates/a.docx" });
      expect(await readFile(path.join(dir, "templates/a.docx"), "utf8")).toBe("hello");
      expect(blobPut).not.toHaveBeenCalled();
    });

    it("getFile reads the file back from disk", async () => {
      const { putFile, getFile } = await import("@/lib/storage");
      await putFile("templates/a.docx", Buffer.from("hello"), "text/plain");

      const result = await getFile("local://templates/a.docx");

      expect(result?.toString()).toBe("hello");
    });

    it("getFile returns null when the file doesn't exist", async () => {
      const { getFile } = await import("@/lib/storage");

      expect(await getFile("local://templates/missing.docx")).toBeNull();
    });

    it("deleteFile removes the file from disk", async () => {
      const { putFile, deleteFile, getFile } = await import("@/lib/storage");
      await putFile("templates/a.docx", Buffer.from("hello"), "text/plain");

      await deleteFile("local://templates/a.docx");

      expect(await getFile("local://templates/a.docx")).toBeNull();
    });

    it("deleteFile is a no-op when the file doesn't exist", async () => {
      const { deleteFile } = await import("@/lib/storage");

      await expect(deleteFile("local://templates/missing.docx")).resolves.toBeUndefined();
    });
  });
});
