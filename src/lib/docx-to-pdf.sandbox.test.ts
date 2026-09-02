// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  after,
  makeSandbox,
  mockDocxToPdfDeps,
  ok,
  readFileToBuffer,
  resetDocxToPdfMocks,
  runCommand,
  sandboxCreate,
  stop,
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
