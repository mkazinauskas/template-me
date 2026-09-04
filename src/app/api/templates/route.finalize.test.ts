// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { finalizeRequest, importHandlers, mockTemplatesRouteDeps, state } from "./route.test-helpers";

mockTemplatesRouteDeps();

// Real .docx files are zip archives, which always start with this 4-byte signature.
const ZIP_MAGIC = "\x50\x4b\x03\x04";
const BLOB_URL = "https://blob.example/templates/uuid-offer.docx";
const BLOB_PATHNAME = "templates/uuid-offer.docx";

describe("POST /api/templates (client-direct-to-Blob finalize)", () => {
  beforeEach(() => {
    state.insertedRow = null;
    state.session = { user: { id: "user-1", email: "owner@example.com" } };
    state.extractFieldsError = null;
    state.extractFieldsResult = {
      fields: [{ key: "name", label: "Name", type: "string", params: [] }],
      warnings: [],
    };
    state.storedFiles = { [BLOB_URL]: Buffer.from(`${ZIP_MAGIC}dummy`) };
    state.deletedUrls = [];
  });

  it("returns 401 when there is no session", async () => {
    state.session = null;
    const { POST } = await importHandlers();

    const res = await POST(
      finalizeRequest({ blobUrl: BLOB_URL, blobPathname: BLOB_PATHNAME, originalFilename: "offer.docx" })
    );

    expect(res.status).toBe(401);
  });

  it("rejects a request missing upload details", async () => {
    const { POST } = await importHandlers();

    const res = await POST(finalizeRequest({ blobUrl: BLOB_URL }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Missing upload details");
  });

  it("rejects a blobPathname outside the templates/ prefix", async () => {
    const { POST } = await importHandlers();

    const res = await POST(
      finalizeRequest({ blobUrl: BLOB_URL, blobPathname: "other/uuid-offer.docx", originalFilename: "offer.docx" })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Invalid upload");
  });

  it("rejects when the uploaded blob can't be found", async () => {
    const { POST } = await importHandlers();

    const res = await POST(
      finalizeRequest({
        blobUrl: "https://blob.example/templates/missing.docx",
        blobPathname: "templates/missing.docx",
        originalFilename: "offer.docx",
      })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Uploaded file not found");
  });

  it("deletes the blob and rejects a docx with no templated fields", async () => {
    state.extractFieldsResult = { fields: [], warnings: [] };
    const { POST } = await importHandlers();

    const res = await POST(
      finalizeRequest({ blobUrl: BLOB_URL, blobPathname: BLOB_PATHNAME, originalFilename: "offer.docx" })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("No templated fields found");
    expect(state.deletedUrls).toContain(BLOB_URL);
  });

  it("stores the template referencing the already-uploaded blob", async () => {
    const { POST } = await importHandlers();

    const res = await POST(
      finalizeRequest({
        blobUrl: BLOB_URL,
        blobPathname: BLOB_PATHNAME,
        originalFilename: "offer.docx",
        name: "  Offer Letter  ",
      })
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.template.name).toBe("Offer Letter");
    expect(json.template.blobUrl).toBe(BLOB_URL);
    expect(json.template.blobPathname).toBe(BLOB_PATHNAME);
    expect(state.insertedRow?.userId).toBe("user-1");
    expect(state.deletedUrls).toEqual([]);
  });
});
