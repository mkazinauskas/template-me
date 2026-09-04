import { vi } from "vitest";

/**
 * Manual mock for `@/lib/orpc`, picked up by `vi.mock("@/lib/orpc")` in tests.
 * Every procedure is a bare `vi.fn()` — configure return values per test with
 * `orpc.templates.<name>.mockResolvedValue(...)`.
 */
export const orpc = {
  templates: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    setPublic: vi.fn(),
    delete: vi.fn(),
    download: vi.fn(),
    generate: vi.fn(),
    generateBulk: vi.fn(),
  },
};

export class ORPCError extends Error {
  code: string;
  data: unknown;
  constructor(code: string, options?: { message?: string; data?: unknown }) {
    super(options?.message ?? code);
    this.name = "ORPCError";
    this.code = code;
    this.data = options?.data;
  }
}

export function orpcErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
