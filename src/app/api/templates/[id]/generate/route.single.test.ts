// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  importPost,
  makeTemplate,
  mockGenerateRouteDeps,
  params,
  postRequest,
  resetState,
  state,
  VALID_DATA,
} from "./route.test-helpers";

mockGenerateRouteDeps();

describe("POST /api/templates/[id]/generate", () => {
  beforeEach(resetState);

  it("returns 429 when the per-user rate limit has been exceeded", async () => {
    state.rateLimited = true;
    const POST = await importPost();

    const res = await POST(postRequest({ data: VALID_DATA }), params());
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error).toContain("Too many document generation requests");
    expect(res.headers.get("Retry-After")).toBe("30");
  });

  it("returns 404 for a private template when there is no session", async () => {
    state.session = null;
    const POST = await importPost();

    const res = await POST(postRequest({ data: VALID_DATA }), params());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Template not found");
  });

  it("returns 404 when the template does not exist", async () => {
    state.templateRow = null;
    const POST = await importPost();

    const res = await POST(postRequest({ data: VALID_DATA }), params("missing"));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Template not found");
  });

  it("returns 404 when a private template belongs to a different user", async () => {
    state.templateRow = makeTemplate({ userId: "someone-else" });
    const POST = await importPost();

    const res = await POST(postRequest({ data: VALID_DATA }), params());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Template not found");
  });

  it("generates a document for a non-owner when the template is public", async () => {
    state.session = { user: { id: "user-2", email: "other@example.com" } };
    state.templateRow = makeTemplate({ userId: "someone-else", isPublic: true });
    const POST = await importPost();

    const res = await POST(postRequest({ data: VALID_DATA }), params());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("generates a document for an anonymous caller when the template is public", async () => {
    state.session = null;
    state.templateRow = makeTemplate({ userId: "someone-else", isPublic: true });
    const POST = await importPost();

    const res = await POST(postRequest({ data: VALID_DATA }), params());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("returns 400 for a malformed JSON body", async () => {
    const req = new NextRequest("http://localhost/api/templates/t1/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const POST = await importPost();

    const res = await POST(req, params());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Missing field data");
  });

  it("returns 400 when required field data is missing", async () => {
    const POST = await importPost();

    const res = await POST(postRequest({ data: { full_name: "Jane" } }), params());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("Missing values for:");
  });

  it("returns 400 for an invalid number value", async () => {
    const POST = await importPost();

    const res = await POST(
      postRequest({ data: { ...VALID_DATA, salary: "not-a-number" } }),
      params()
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Invalid value for: salary");
  });

  it("returns 400 for a select value outside the allowed options", async () => {
    const POST = await importPost();

    const res = await POST(
      postRequest({ data: { ...VALID_DATA, employment_type: "Freelance" } }),
      params()
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Invalid value for: employment_type");
  });

  it("allows a preview request with empty/missing values (skips required-field validation)", async () => {
    const POST = await importPost();

    const res = await POST(postRequest({ data: {}, preview: true }), params());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe("inline");
  });

  it("returns a PDF with an attachment disposition and sanitized filename for a full request", async () => {
    state.templateRow = makeTemplate({ name: "Q4 Offer / Letter!!" });
    const POST = await importPost();

    const res = await POST(postRequest({ data: VALID_DATA }), params());
    const buf = Buffer.from(await res.arrayBuffer());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="Q4_Offer_Letter_.pdf"');
    expect(buf.toString()).toContain("Jane Doe");
  });

  it("returns 500 when the template file is missing from blob storage", async () => {
    state.storedFile = null;
    const POST = await importPost();

    const res = await POST(postRequest({ data: VALID_DATA }), params());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Template file is missing from storage");
  });

  it("returns 500 when rendering the docx template fails", async () => {
    state.renderDocxError = new Error("bad template");
    const POST = await importPost();

    const res = await POST(postRequest({ data: VALID_DATA }), params());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Failed to fill in the document");
  });

  it("returns 500 when PDF conversion fails", async () => {
    state.convertSingleError = new Error("libreoffice exploded");
    const POST = await importPost();

    const res = await POST(postRequest({ data: VALID_DATA }), params());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Failed to convert document to PDF");
  });

  it("returns a docx with an attachment disposition and sanitized filename when format is docx", async () => {
    state.templateRow = makeTemplate({ name: "Q4 Offer / Letter!!" });
    // If the docx path accidentally triggers PDF conversion, this forces a failure.
    state.convertSingleError = new Error("should not be called for docx format");
    const POST = await importPost();

    const res = await POST(postRequest({ data: VALID_DATA, format: "docx" }), params());
    const buf = Buffer.from(await res.arrayBuffer());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="Q4_Offer_Letter_.docx"');
    expect(buf.toString()).toContain("Jane Doe");
  });

  it("still renders a PDF preview even when format is docx", async () => {
    const POST = await importPost();

    const res = await POST(postRequest({ data: {}, preview: true, format: "docx" }), params());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe("inline");
  });
});
