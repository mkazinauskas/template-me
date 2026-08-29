import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runCommand = vi.fn();
const writeFiles = vi.fn();
const readFileToBuffer = vi.fn();
const stop = vi.fn();
const sandboxCreate = vi.fn();
const after = vi.fn((cb: () => void) => cb());

vi.mock("@vercel/sandbox", () => ({
  Sandbox: { create: (...args: unknown[]) => sandboxCreate(...args) },
}));

vi.mock("next/server", () => ({ after: (cb: () => void) => after(cb) }));

function makeSandbox() {
  return {
    runCommand,
    writeFiles,
    readFileToBuffer,
    stop,
  };
}

function ok(overrides: Partial<{ exitCode: number; stdout: () => Promise<string>; stderr: () => Promise<string> }> = {}) {
  return {
    exitCode: 0,
    stdout: async () => "",
    stderr: async () => "",
    ...overrides,
  };
}

describe("docx-to-pdf", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    runCommand.mockReset();
    writeFiles.mockReset();
    readFileToBuffer.mockReset();
    stop.mockReset().mockResolvedValue(undefined);
    sandboxCreate.mockReset();
    after.mockClear();
    process.env = { ...originalEnv };
    delete process.env.LIBREOFFICE_SANDBOX_SNAPSHOT_ID;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("createPdfSandbox", () => {
    it("boots from a snapshot when LIBREOFFICE_SANDBOX_SNAPSHOT_ID is set", async () => {
      process.env.LIBREOFFICE_SANDBOX_SNAPSHOT_ID = "snap-123";
      sandboxCreate.mockResolvedValue(makeSandbox());
      const { createPdfSandbox } = await import("@/lib/docx-to-pdf");

      await createPdfSandbox();

      expect(sandboxCreate).toHaveBeenCalledWith({
        source: { type: "snapshot", snapshotId: "snap-123" },
        timeout: 120_000,
      });
    });

    it("boots a fresh node24 runtime when no snapshot id is set", async () => {
      sandboxCreate.mockResolvedValue(makeSandbox());
      const { createPdfSandbox } = await import("@/lib/docx-to-pdf");

      await createPdfSandbox();

      expect(sandboxCreate).toHaveBeenCalledWith({ runtime: "node24", timeout: 300_000 });
    });
  });

  describe("convertDocxToPdf", () => {
    it("installs LibreOffice, converts, and returns the resulting PDF buffer", async () => {
      const sandbox = makeSandbox();
      runCommand.mockResolvedValue(ok());
      readFileToBuffer.mockResolvedValue(Buffer.from("pdf-bytes"));
      const { convertDocxToPdf } = await import("@/lib/docx-to-pdf");

      const result = await convertDocxToPdf(Buffer.from("docx-bytes"), Promise.resolve(sandbox as never));

      expect(result.toString()).toBe("pdf-bytes");
      expect(writeFiles).toHaveBeenCalledWith([{ path: "input.docx", content: expect.any(Buffer) }]);
      expect(runCommand).toHaveBeenCalledTimes(2);
      expect(runCommand.mock.calls[0][0]).toBe("sh");
      expect(runCommand.mock.calls[0][1][1]).toContain("dnf install");
      expect(runCommand.mock.calls[1][1][1]).toContain("soffice --headless --convert-to pdf");
      expect(readFileToBuffer).toHaveBeenCalledWith({ path: "/vercel/sandbox/input.pdf" });
    });

    it("skips the LibreOffice install step when using a pre-built snapshot", async () => {
      process.env.LIBREOFFICE_SANDBOX_SNAPSHOT_ID = "snap-123";
      const sandbox = makeSandbox();
      runCommand.mockResolvedValue(ok());
      readFileToBuffer.mockResolvedValue(Buffer.from("pdf-bytes"));
      const { convertDocxToPdf } = await import("@/lib/docx-to-pdf");

      await convertDocxToPdf(Buffer.from("docx-bytes"), Promise.resolve(sandbox as never));

      expect(runCommand).toHaveBeenCalledTimes(1);
      expect(runCommand.mock.calls[0][1][1]).toContain("soffice");
    });

    it("stops the sandbox after a successful conversion via next/server's after()", async () => {
      const sandbox = makeSandbox();
      runCommand.mockResolvedValue(ok());
      readFileToBuffer.mockResolvedValue(Buffer.from("pdf-bytes"));
      const { convertDocxToPdf } = await import("@/lib/docx-to-pdf");

      await convertDocxToPdf(Buffer.from("docx-bytes"), Promise.resolve(sandbox as never));

      expect(after).toHaveBeenCalledTimes(1);
      expect(stop).toHaveBeenCalledTimes(1);
    });

    it("throws and stops the sandbox immediately when the LibreOffice install fails", async () => {
      const sandbox = makeSandbox();
      runCommand.mockResolvedValue(ok({ exitCode: 1, stderr: async () => "install boom" }));
      const { convertDocxToPdf } = await import("@/lib/docx-to-pdf");

      await expect(
        convertDocxToPdf(Buffer.from("docx-bytes"), Promise.resolve(sandbox as never))
      ).rejects.toThrow(/Failed to install LibreOffice.*install boom/);
      expect(stop).toHaveBeenCalledTimes(1);
      expect(after).not.toHaveBeenCalled();
    });

    it("throws and stops the sandbox when the soffice conversion fails", async () => {
      const sandbox = makeSandbox();
      runCommand
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(ok({ exitCode: 1, stdout: async () => "convert boom" }));
      const { convertDocxToPdf } = await import("@/lib/docx-to-pdf");

      await expect(
        convertDocxToPdf(Buffer.from("docx-bytes"), Promise.resolve(sandbox as never))
      ).rejects.toThrow(/soffice conversion failed.*convert boom/);
      expect(stop).toHaveBeenCalledTimes(1);
    });

    it("throws when the conversion produces no output file", async () => {
      const sandbox = makeSandbox();
      runCommand.mockResolvedValue(ok());
      readFileToBuffer.mockResolvedValue(null);
      const { convertDocxToPdf } = await import("@/lib/docx-to-pdf");

      await expect(
        convertDocxToPdf(Buffer.from("docx-bytes"), Promise.resolve(sandbox as never))
      ).rejects.toThrow("Conversion produced no output PDF");
      expect(stop).toHaveBeenCalledTimes(1);
    });
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
});
