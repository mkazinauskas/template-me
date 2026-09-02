// @vitest-environment node
import { vi } from "vitest";
import { writeFileSync } from "node:fs";
import path from "node:path";

export const runCommand = vi.fn();
export const writeFiles = vi.fn();
export const readFileToBuffer = vi.fn();
export const stop = vi.fn();
export const sandboxCreate = vi.fn();
export const after = vi.fn((cb: () => void) => cb());
export const execFileMock = vi.fn();

/** Installs the mocks for @vercel/sandbox, next/server's after(), and node:child_process. */
export function mockDocxToPdfDeps() {
  vi.doMock("@vercel/sandbox", () => ({
    Sandbox: { create: (...args: unknown[]) => sandboxCreate(...args) },
  }));
  vi.doMock("next/server", () => ({ after: (cb: () => void) => after(cb) }));
  vi.doMock("node:child_process", () => ({
    execFile: (...args: unknown[]) => execFileMock(...args),
  }));
}

export function makeSandbox() {
  return { runCommand, writeFiles, readFileToBuffer, stop };
}

/** A successful `sandbox.runCommand` result, with individual fields overridable. */
export function ok(
  overrides: Partial<{ exitCode: number; stdout: () => Promise<string>; stderr: () => Promise<string> }> = {}
) {
  return { exitCode: 0, stdout: async () => "", stderr: async () => "", ...overrides };
}

/**
 * Resets every spy and restores the default local-soffice behaviour (write a
 * `pdf-for-<name>` file next to each input). Also clears the env vars the module
 * reads at import time. Call from beforeEach after `vi.resetModules()`.
 */
export function resetDocxToPdfMocks(originalEnv: NodeJS.ProcessEnv) {
  runCommand.mockReset();
  writeFiles.mockReset();
  readFileToBuffer.mockReset();
  stop.mockReset().mockResolvedValue(undefined);
  sandboxCreate.mockReset();
  after.mockClear();
  execFileMock.mockReset();
  execFileMock.mockImplementation(
    (_cmd: string, args: string[], _options: unknown, callback: (err: unknown) => void) => {
      const outdirIndex = args.indexOf("--outdir");
      const dir = args[outdirIndex + 1];
      const inputPaths = args.slice(outdirIndex + 2);
      for (const inputPath of inputPaths) {
        const base = path.basename(inputPath, ".docx");
        writeFileSync(path.join(dir, `${base}.pdf`), `pdf-for-${base}`);
      }
      callback(null);
    }
  );
  process.env = { ...originalEnv };
  delete process.env.LIBREOFFICE_SANDBOX_SNAPSHOT_ID;
  delete process.env.LOCAL_MODE;
}
