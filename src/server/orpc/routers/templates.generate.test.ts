// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { call, ORPCError } from "@orpc/server";
import {
  ctx,
  GENERATE_FIELDS,
  importRouter,
  makeTemplate,
  mockTemplatesRouterDeps,
  resetState,
  state,
  VALID_DATA,
} from "./templates.test-helpers";

mockTemplatesRouterDeps();

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function expectORPCError(promise: Promise<unknown>, code: string): Promise<ORPCError<string, unknown>> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ORPCError) {
      expect(error.code).toBe(code);
      return error;
    }
    throw error;
  }
  throw new Error(`expected the call to reject with an ORPCError(${code})`);
}

function withFields() {
  state.rows = [makeTemplate({ fields: GENERATE_FIELDS })];
  state.storedFiles = { "https://blob/offer.docx": Buffer.from("original-docx-bytes") };
}

describe("templates.generate", () => {
  beforeEach(() => {
    resetState();
    withFields();
  });

  it("rejects with TOO_MANY_REQUESTS when the rate limit is exceeded", async () => {
    state.rateLimited = true;
    const router = await importRouter();
    const error = await expectORPCError(
      call(router.generate, { id: "t1", data: VALID_DATA }, ctx()),
      "TOO_MANY_REQUESTS"
    );
    expect(error.message).toContain("Too many document generation requests");
    expect(error.data).toEqual({ retryAfterSeconds: 30 });
  });

  it("rejects with NOT_FOUND for a private template with no session", async () => {
    state.session = null;
    const router = await importRouter();
    await expectORPCError(call(router.generate, { id: "t1", data: VALID_DATA }, ctx()), "NOT_FOUND");
  });

  it("rejects with NOT_FOUND when the template does not exist", async () => {
    state.rows = [];
    const router = await importRouter();
    await expectORPCError(call(router.generate, { id: "missing", data: VALID_DATA }, ctx()), "NOT_FOUND");
  });

  it("generates for a non-owner when the template is public", async () => {
    state.session = { user: { id: "user-2", email: "other@example.com" } };
    state.rows = [makeTemplate({ userId: "someone-else", isPublic: true, fields: GENERATE_FIELDS })];
    const router = await importRouter();
    const file = await call(router.generate, { id: "t1", data: VALID_DATA }, ctx());
    expect(file.type).toBe("application/pdf");
  });

  it("generates for an anonymous caller when the template is public", async () => {
    state.session = null;
    state.rows = [makeTemplate({ userId: "someone-else", isPublic: true, fields: GENERATE_FIELDS })];
    const router = await importRouter();
    const file = await call(router.generate, { id: "t1", data: VALID_DATA }, ctx());
    expect(file.type).toBe("application/pdf");
  });

  it("rejects with BAD_REQUEST when required field data is missing", async () => {
    const router = await importRouter();
    const error = await expectORPCError(
      call(router.generate, { id: "t1", data: { full_name: "Jane" } }, ctx()),
      "BAD_REQUEST"
    );
    expect(error.message).toContain("Missing values for:");
  });

  it("rejects with BAD_REQUEST for an invalid number value", async () => {
    const router = await importRouter();
    const error = await expectORPCError(
      call(router.generate, { id: "t1", data: { ...VALID_DATA, salary: "not-a-number" } }, ctx()),
      "BAD_REQUEST"
    );
    expect(error.message).toBe("Invalid value for: salary");
  });

  it("rejects with BAD_REQUEST for a select value outside the allowed options", async () => {
    const router = await importRouter();
    const error = await expectORPCError(
      call(router.generate, { id: "t1", data: { ...VALID_DATA, employment_type: "Freelance" } }, ctx()),
      "BAD_REQUEST"
    );
    expect(error.message).toBe("Invalid value for: employment_type");
  });

  it("allows a preview with empty values and returns a PDF", async () => {
    const router = await importRouter();
    const file = await call(router.generate, { id: "t1", data: {}, preview: true }, ctx());
    expect(file.type).toBe("application/pdf");
  });

  it("returns a PDF named after the sanitized template name for a full request", async () => {
    state.rows = [makeTemplate({ name: "Q4 Offer / Letter!!", fields: GENERATE_FIELDS })];
    const router = await importRouter();
    const file = await call(router.generate, { id: "t1", data: VALID_DATA }, ctx());
    expect(file.type).toBe("application/pdf");
    expect(file.name).toBe("Q4_Offer_Letter_.pdf");
    expect(await file.text()).toContain("Jane Doe");
  });

  it("returns a docx (skipping PDF conversion) when format is docx", async () => {
    state.rows = [makeTemplate({ name: "Q4 Offer / Letter!!", fields: GENERATE_FIELDS })];
    state.convertSingleError = new Error("should not convert for docx format");
    const router = await importRouter();
    const file = await call(router.generate, { id: "t1", data: VALID_DATA, format: "docx" }, ctx());
    expect(file.type).toBe(DOCX_TYPE);
    expect(file.name).toBe("Q4_Offer_Letter_.docx");
    expect(await file.text()).toContain("Jane Doe");
  });

  it("still renders a PDF preview even when format is docx", async () => {
    const router = await importRouter();
    const file = await call(
      router.generate,
      { id: "t1", data: {}, preview: true, format: "docx" },
      ctx()
    );
    expect(file.type).toBe("application/pdf");
  });

  it("rejects with INTERNAL_SERVER_ERROR when the template file is missing from storage", async () => {
    state.storedFiles = {};
    const router = await importRouter();
    await expectORPCError(
      call(router.generate, { id: "t1", data: VALID_DATA }, ctx()),
      "INTERNAL_SERVER_ERROR"
    );
  });

  it("rejects with INTERNAL_SERVER_ERROR when rendering the docx fails", async () => {
    state.renderDocxError = new Error("bad template");
    const router = await importRouter();
    const error = await expectORPCError(
      call(router.generate, { id: "t1", data: VALID_DATA }, ctx()),
      "INTERNAL_SERVER_ERROR"
    );
    expect(error.message).toBe("Failed to fill in the document");
  });

  it("rejects with INTERNAL_SERVER_ERROR when PDF conversion fails", async () => {
    state.convertSingleError = new Error("libreoffice exploded");
    const router = await importRouter();
    const error = await expectORPCError(
      call(router.generate, { id: "t1", data: VALID_DATA }, ctx()),
      "INTERNAL_SERVER_ERROR"
    );
    expect(error.message).toBe("Failed to convert document to PDF");
  });
});

describe("templates.generateBulk", () => {
  beforeEach(() => {
    resetState();
    withFields();
  });

  it("rejects with BAD_REQUEST when no rows are provided", async () => {
    const router = await importRouter();
    const error = await expectORPCError(
      call(router.generateBulk, { id: "t1", rows: [] }, ctx()),
      "BAD_REQUEST"
    );
    expect(error.message).toBe("No rows provided");
  });

  it("rejects with BAD_REQUEST when the row count exceeds 100", async () => {
    const rows = Array.from({ length: 101 }, () => ({ data: VALID_DATA }));
    const router = await importRouter();
    const error = await expectORPCError(
      call(router.generateBulk, { id: "t1", rows }, ctx()),
      "BAD_REQUEST"
    );
    expect(error.message).toContain("Too many rows (101)");
  });

  it("rejects with BAD_REQUEST when a row is missing its data object", async () => {
    const router = await importRouter();
    await expectORPCError(
      // @ts-expect-error — deliberately invalid: a row with no `data`
      call(router.generateBulk, { id: "t1", rows: [{ data: VALID_DATA }, {}] }, ctx()),
      "BAD_REQUEST"
    );
  });

  it("rejects naming the offending row when one fails validation", async () => {
    const router = await importRouter();
    const error = await expectORPCError(
      call(router.generateBulk, { id: "t1", rows: [{ data: { ...VALID_DATA, salary: "oops" } }] }, ctx()),
      "BAD_REQUEST"
    );
    expect(error.message).toBe("Row 1: Invalid value for: salary");
  });

  it("builds a zip with one PDF per row using custom and default filenames", async () => {
    const router = await importRouter();
    const file = await call(
      router.generateBulk,
      {
        id: "t1",
        rows: [
          { data: VALID_DATA, filename: "Custom Name!" },
          { data: { ...VALID_DATA, full_name: "John Roe" } },
        ],
      },
      ctx()
    );
    expect(file.type).toBe("application/zip");
    expect(file.name).toBe("Offer_Letter.zip");
    const zip = new PizZip(Buffer.from(await file.arrayBuffer()));
    const names = Object.keys(zip.files);
    expect(names).toContain("Custom_Name_.pdf");
    expect(names).toContain("Offer_Letter-2.pdf");
  });

  it("disambiguates duplicate filenames with a numeric suffix", async () => {
    const router = await importRouter();
    const file = await call(
      router.generateBulk,
      {
        id: "t1",
        rows: [
          { data: VALID_DATA, filename: "same" },
          { data: { ...VALID_DATA, full_name: "John Roe" }, filename: "same" },
        ],
      },
      ctx()
    );
    const zip = new PizZip(Buffer.from(await file.arrayBuffer()));
    expect(Object.keys(zip.files).sort()).toEqual(["same-2.pdf", "same.pdf"]);
  });

  it("rejects with INTERNAL_SERVER_ERROR when the template file is missing from storage", async () => {
    state.storedFiles = {};
    const router = await importRouter();
    const error = await expectORPCError(
      call(router.generateBulk, { id: "t1", rows: [{ data: VALID_DATA }] }, ctx()),
      "INTERNAL_SERVER_ERROR"
    );
    expect(error.message).toBe("Template file is missing from storage");
  });

  it("rejects with INTERNAL_SERVER_ERROR when filling the docx fails", async () => {
    state.renderDocxError = new Error("bad template");
    const router = await importRouter();
    const error = await expectORPCError(
      call(router.generateBulk, { id: "t1", rows: [{ data: VALID_DATA }] }, ctx()),
      "INTERNAL_SERVER_ERROR"
    );
    expect(error.message).toBe("Failed to fill in the document");
  });

  it("rejects with INTERNAL_SERVER_ERROR when bulk PDF conversion fails", async () => {
    state.convertBulkError = new Error("bulk boom");
    const router = await importRouter();
    const error = await expectORPCError(
      call(router.generateBulk, { id: "t1", rows: [{ data: VALID_DATA }] }, ctx()),
      "INTERNAL_SERVER_ERROR"
    );
    expect(error.message).toBe("Failed to convert documents to PDF");
  });

  it("builds a zip of docx files when format is docx, skipping PDF conversion", async () => {
    state.convertBulkError = new Error("should not convert for docx format");
    const router = await importRouter();
    const file = await call(
      router.generateBulk,
      { id: "t1", rows: [{ data: VALID_DATA, filename: "Custom Name!" }], format: "docx" },
      ctx()
    );
    expect(file.type).toBe("application/zip");
    const zip = new PizZip(Buffer.from(await file.arrayBuffer()));
    expect(Object.keys(zip.files)).toContain("Custom_Name_.docx");
  });
});

describe("templates.download", () => {
  beforeEach(() => {
    resetState();
    state.storedFiles = { "https://blob/offer.docx": Buffer.from("PK raw docx bytes") };
  });

  it("returns the raw template file to its owner as a .docx", async () => {
    state.rows = [makeTemplate()];
    const router = await importRouter();
    const file = await call(router.download, { id: "t1" }, ctx());
    expect(file.type).toBe(DOCX_TYPE);
    expect(file.name).toBe("Offer_Letter.docx");
    expect(await file.text()).toBe("PK raw docx bytes");
  });

  it("rejects with NOT_FOUND for a private template with no session", async () => {
    state.session = null;
    state.rows = [makeTemplate()];
    const router = await importRouter();
    await expectORPCError(call(router.download, { id: "t1" }, ctx()), "NOT_FOUND");
  });

  it("serves a public template to an anonymous caller", async () => {
    state.session = null;
    state.rows = [makeTemplate({ userId: "someone-else", isPublic: true })];
    const router = await importRouter();
    const file = await call(router.download, { id: "t1" }, ctx());
    expect(file.name).toBe("Offer_Letter.docx");
  });

  it("rejects with INTERNAL_SERVER_ERROR when the file is missing from storage", async () => {
    state.rows = [makeTemplate()];
    state.storedFiles = {};
    const router = await importRouter();
    await expectORPCError(call(router.download, { id: "t1" }, ctx()), "INTERNAL_SERVER_ERROR");
  });
});
