// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import PizZip from "pizzip";
import {
  importPost,
  mockGenerateRouteDeps,
  params,
  postRequest,
  resetState,
  state,
  VALID_DATA,
} from "./route.test-helpers";

mockGenerateRouteDeps();

describe("POST /api/templates/[id]/generate (bulk)", () => {
  beforeEach(resetState);

  it("returns 400 when no rows are provided", async () => {
    const POST = await importPost();

    const res = await POST(postRequest({ rows: [] }), params());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("No rows provided");
  });

  it("returns 400 when the row count exceeds the max of 100", async () => {
    const rows = Array.from({ length: 101 }, () => ({ data: VALID_DATA }));
    const POST = await importPost();

    const res = await POST(postRequest({ rows }), params());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("Too many rows (101)");
  });

  it("returns 400 naming the offending row when a row is missing data", async () => {
    const POST = await importPost();

    const res = await POST(postRequest({ rows: [{ data: VALID_DATA }, {}] }), params());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Row 2: missing field data");
  });

  it("returns 400 naming the offending row when a row fails validation", async () => {
    const POST = await importPost();

    const res = await POST(
      postRequest({ rows: [{ data: { ...VALID_DATA, salary: "oops" } }] }),
      params()
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Row 1: Invalid value for: salary");
  });

  it("builds a zip with one PDF per row, using custom and default filenames", async () => {
    const POST = await importPost();

    const res = await POST(
      postRequest({
        rows: [
          { data: VALID_DATA, filename: "Custom Name!" },
          { data: { ...VALID_DATA, full_name: "John Roe" } },
        ],
      }),
      params()
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="Offer_Letter.zip"');

    const zipBuf = Buffer.from(await res.arrayBuffer());
    const zip = new PizZip(zipBuf);
    const names = Object.keys(zip.files);
    expect(names).toContain("Custom_Name_.pdf");
    expect(names).toContain("Offer Letter-2.pdf".replace(/[^a-zA-Z0-9-_.]+/g, "_"));
  });

  it("disambiguates duplicate filenames with a numeric suffix", async () => {
    const POST = await importPost();

    const res = await POST(
      postRequest({
        rows: [
          { data: VALID_DATA, filename: "same" },
          { data: { ...VALID_DATA, full_name: "John Roe" }, filename: "same" },
        ],
      }),
      params()
    );

    const zipBuf = Buffer.from(await res.arrayBuffer());
    const zip = new PizZip(zipBuf);
    expect(Object.keys(zip.files).sort()).toEqual(["same-2.pdf", "same.pdf"]);
  });

  it("returns 500 when bulk PDF conversion fails", async () => {
    state.convertBulkError = new Error("bulk boom");
    const POST = await importPost();

    const res = await POST(postRequest({ rows: [{ data: VALID_DATA }] }), params());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Failed to convert documents to PDF");
  });

  it("builds a zip with one docx per row when format is docx, skipping PDF conversion", async () => {
    // If the docx path accidentally triggers PDF conversion, this forces a failure.
    state.convertBulkError = new Error("should not be called for docx format");
    const POST = await importPost();

    const res = await POST(
      postRequest({
        rows: [
          { data: VALID_DATA, filename: "Custom Name!" },
          { data: { ...VALID_DATA, full_name: "John Roe" } },
        ],
        format: "docx",
      }),
      params()
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");

    const zipBuf = Buffer.from(await res.arrayBuffer());
    const zip = new PizZip(zipBuf);
    const names = Object.keys(zip.files);
    expect(names).toContain("Custom_Name_.docx");
  });
});
