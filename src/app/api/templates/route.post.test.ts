// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import {
  docxFile,
  importHandlers,
  mockTemplatesRouteDeps,
  state,
  uploadRequest,
} from "./route.test-helpers";

mockTemplatesRouteDeps();

describe("POST /api/templates", () => {
  beforeEach(() => {
    state.insertedRow = null;
    state.session = { user: { id: "user-1", email: "owner@example.com" } };
    state.extractFieldsError = null;
    state.extractFieldsResult = {
      fields: [{ key: "name", label: "Name", type: "string", params: [] }],
      warnings: [],
    };
  });

  it("returns 401 when there is no session", async () => {
    state.session = null;
    const { POST } = await importHandlers();

    const res = await POST(uploadRequest());
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("rejects a request with no file", async () => {
    const { POST } = await importHandlers();

    const res = await POST(uploadRequest({ file: null }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Missing file");
  });

  it("rejects a non-.docx file", async () => {
    const { POST } = await importHandlers();

    const res = await POST(uploadRequest({ file: new File(["x"], "notes.txt", { type: "text/plain" }) }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("File must be a .docx document");
  });

  it("rejects a file over the size cap", async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    const { POST } = await importHandlers();

    const res = await POST(
      uploadRequest({
        file: new File([big], "big.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("too large");
  });

  it("rejects a .docx-named file that isn't actually a zip", async () => {
    const { POST } = await importHandlers();

    const res = await POST(uploadRequest({ file: docxFile("fake.docx", "not a zip file at all") }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Could not read this file as a Word document");
  });

  it("rejects a docx that fails to parse", async () => {
    state.extractFieldsError = new Error("corrupt zip");
    const { POST } = await importHandlers();

    const res = await POST(uploadRequest());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Could not read this file as a Word document");
  });

  it("rejects a docx with no templated fields", async () => {
    state.extractFieldsResult = { fields: [], warnings: [] };
    const { POST } = await importHandlers();

    const res = await POST(uploadRequest());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("No templated fields found");
  });

  it("stores the uploaded template and returns it with warnings", async () => {
    state.extractFieldsResult = {
      fields: [{ key: "name", label: "Name", type: "string", params: [] }],
      warnings: ['Field "x": type "foo" is unrecognized'],
    };
    const { POST } = await importHandlers();

    const res = await POST(uploadRequest({ file: docxFile("offer.docx"), name: "  Offer Letter  " }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.template.name).toBe("Offer Letter");
    expect(json.template.originalFilename).toBe("offer.docx");
    expect(json.warnings).toEqual(['Field "x": type "foo" is unrecognized']);
  });

  it("stores the uploaded template under the current user's id", async () => {
    const { POST } = await importHandlers();

    await POST(uploadRequest({ file: docxFile("offer.docx") }));

    expect(state.insertedRow?.userId).toBe("user-1");
  });

  it("derives the template name from the filename when none is given", async () => {
    const { POST } = await importHandlers();

    await POST(uploadRequest({ file: docxFile("My Contract.docx") }));

    expect(state.insertedRow?.name).toBe("My Contract");
  });
});
