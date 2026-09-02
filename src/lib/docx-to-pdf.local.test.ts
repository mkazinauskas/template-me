// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  execFileMock,
  makeSandbox,
  mockDocxToPdfDeps,
  ok,
  readFileToBuffer,
  resetDocxToPdfMocks,
  runCommand,
  sandboxCreate,
  writeFiles,
} from "./docx-to-pdf.test-helpers";

mockDocxToPdfDeps();

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  resetDocxToPdfMocks(originalEnv);
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("convertDocxBuffersToPdf", () => {
  it("writes all inputs, converts them in one call, and returns PDFs in order", async () => {
    const sandbox = makeSandbox();
    runCommand.mockResolvedValue(ok());
    readFileToBuffer.mockImplementation(async ({ path }: { path: string }) =>
      Buffer.from(`pdf-for-${path}`)
    );
    const { convertDocxBuffersToPdf } = await import("@/lib/docx-to-pdf");

    const buffers = [Buffer.from("a"), Buffer.from("b"), Buffer.from("c")];
    const result = await convertDocxBuffersToPdf(buffers, Promise.resolve(sandbox as never));

    expect(result).toHaveLength(3);
    expect(result[0].toString()).toBe("pdf-for-/vercel/sandbox/input-0.pdf");
    expect(result[1].toString()).toBe("pdf-for-/vercel/sandbox/input-1.pdf");
    expect(result[2].toString()).toBe("pdf-for-/vercel/sandbox/input-2.pdf");
    expect(writeFiles).toHaveBeenCalledWith([
      { path: "input-0.docx", content: buffers[0] },
      { path: "input-1.docx", content: buffers[1] },
      { path: "input-2.docx", content: buffers[2] },
    ]);
  });

  it("throws naming the specific document index when one output file is missing", async () => {
    const sandbox = makeSandbox();
    runCommand.mockResolvedValue(ok());
    readFileToBuffer.mockImplementation(async ({ path }: { path: string }) =>
      path.includes("input-1") ? null : Buffer.from("ok")
    );
    const { convertDocxBuffersToPdf } = await import("@/lib/docx-to-pdf");

    await expect(
      convertDocxBuffersToPdf([Buffer.from("a"), Buffer.from("b")], Promise.resolve(sandbox as never))
    ).rejects.toThrow("Conversion produced no output PDF for document 2");
  });
});

describe("LOCAL_MODE", () => {
  beforeEach(() => {
    process.env.LOCAL_MODE = "true";
  });

  it("createPdfSandbox resolves to null instead of booting a Vercel Sandbox", async () => {
    const { createPdfSandbox } = await import("@/lib/docx-to-pdf");

    const sandbox = await createPdfSandbox();

    expect(sandbox).toBeNull();
    expect(sandboxCreate).not.toHaveBeenCalled();
  });

  it("convertDocxToPdf shells out to a local soffice binary instead of using a sandbox", async () => {
    const { convertDocxToPdf } = await import("@/lib/docx-to-pdf");

    const result = await convertDocxToPdf(Buffer.from("docx-bytes"));

    expect(result.toString()).toBe("pdf-for-input-0");
    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(sandboxCreate).not.toHaveBeenCalled();
  });

  it("convertDocxBuffersToPdf converts multiple buffers in one soffice invocation", async () => {
    const { convertDocxBuffersToPdf } = await import("@/lib/docx-to-pdf");

    const result = await convertDocxBuffersToPdf([Buffer.from("a"), Buffer.from("b")]);

    expect(result.map((b) => b.toString())).toEqual(["pdf-for-input-0", "pdf-for-input-1"]);
    expect(execFileMock).toHaveBeenCalledTimes(1);
  });

  it("throws when the local soffice conversion fails", async () => {
    execFileMock.mockImplementation(
      (_cmd: string, _args: string[], _options: unknown, callback: (err: unknown) => void) => {
        callback(Object.assign(new Error("boom"), { stderr: "soffice crashed" }));
      }
    );
    const { convertDocxToPdf } = await import("@/lib/docx-to-pdf");

    await expect(convertDocxToPdf(Buffer.from("docx-bytes"))).rejects.toThrow(
      /soffice conversion failed.*soffice crashed/
    );
  });
});
