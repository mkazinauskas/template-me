// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { call, ORPCError } from "@orpc/server";
import {
  ctx,
  importRouter,
  mockTemplatesRouterDeps,
  resetState,
  state,
  ZIP_MAGIC,
} from "./templates.test-helpers";

mockTemplatesRouterDeps();

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function docxFile(name = "template.docx", content: BlobPart = `${ZIP_MAGIC}dummy`) {
  return new File([content], name, { type: DOCX_TYPE });
}

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

describe("templates.create — multipart file (LOCAL_MODE)", () => {
  // `create` dispatches on the server's own mode, so the multipart branch is
  // only reachable with LOCAL_MODE set.
  beforeEach(() => {
    resetState();
    process.env.LOCAL_MODE = "true";
  });
  afterEach(() => {
    delete process.env.LOCAL_MODE;
  });

  it("rejects with UNAUTHORIZED when there is no session", async () => {
    state.session = null;
    const router = await importRouter();
    await expectORPCError(call(router.create, { file: docxFile() }, ctx()), "UNAUTHORIZED");
  });

  it("rejects a non-.docx file", async () => {
    const router = await importRouter();
    const error = await expectORPCError(
      call(router.create, { file: new File(["x"], "notes.txt", { type: "text/plain" }) }, ctx()),
      "BAD_REQUEST"
    );
    expect(error.message).toBe("File must be a .docx document");
  });

  it("rejects a file over the 10 MB size cap", async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    const router = await importRouter();
    const error = await expectORPCError(
      call(router.create, { file: new File([big], "big.docx", { type: DOCX_TYPE }) }, ctx()),
      "BAD_REQUEST"
    );
    expect(error.message).toContain("too large");
  });

  it("rejects a .docx-named file that is not actually a zip", async () => {
    const router = await importRouter();
    const error = await expectORPCError(
      call(router.create, { file: docxFile("fake.docx", "not a zip at all") }, ctx()),
      "BAD_REQUEST"
    );
    expect(error.message).toBe("Could not read this file as a Word document");
  });

  it("rejects a docx that fails to parse", async () => {
    state.extractFieldsError = new Error("corrupt zip");
    const router = await importRouter();
    const error = await expectORPCError(call(router.create, { file: docxFile() }, ctx()), "BAD_REQUEST");
    expect(error.message).toBe("Could not read this file as a Word document");
  });

  it("rejects a docx with no templated fields", async () => {
    state.extractFieldsResult = { fields: [], warnings: [] };
    const router = await importRouter();
    const error = await expectORPCError(call(router.create, { file: docxFile() }, ctx()), "BAD_REQUEST");
    expect(error.message).toContain("No templated fields found");
  });

  it("stores the uploaded template under the caller's id and returns it with warnings", async () => {
    state.extractFieldsResult = {
      fields: [{ key: "name", label: "Name", type: "string", params: [] }],
      warnings: ['Field "x": type "foo" is unrecognized'],
    };
    const router = await importRouter();
    const result = await call(router.create, { file: docxFile("offer.docx"), name: "  Offer Letter  " }, ctx());
    expect(result.template.name).toBe("Offer Letter");
    expect(result.template.originalFilename).toBe("offer.docx");
    expect(result.warnings).toEqual(['Field "x": type "foo" is unrecognized']);
    expect(state.insertedValues?.userId).toBe("user-1");
  });

  it("derives the template name from the filename when none is given", async () => {
    const router = await importRouter();
    await call(router.create, { file: docxFile("My Contract.docx") }, ctx());
    expect(state.insertedValues?.name).toBe("My Contract");
  });

  it("stores under the caller's own prefix", async () => {
    const router = await importRouter();
    await call(router.create, { file: docxFile("offer.docx") }, ctx());
    expect(state.putPathnames[0]).toMatch(/^templates\/user-1\//);
  });

  it("flattens a traversing filename so it can't escape the storage root", async () => {
    const router = await importRouter();
    await call(router.create, { file: docxFile("../../../../etc/passwd.docx") }, ctx());

    const stored = state.putPathnames[0];
    expect(stored).toMatch(/^templates\/user-1\//);
    // Nothing after the per-user prefix may reintroduce a path separator or a
    // parent-directory hop.
    expect(stored.slice("templates/user-1/".length)).not.toMatch(/[/\\]|\.\./);
  });

  it("rejects the direct-to-Blob shape, which belongs to a cloud deployment", async () => {
    const router = await importRouter();
    const error = await expectORPCError(
      call(
        router.create,
        {
          blobUrl: "https://blob.example/templates/user-1/x.docx",
          blobPathname: "templates/user-1/x.docx",
          originalFilename: "x.docx",
        },
        ctx()
      ),
      "BAD_REQUEST"
    );
    expect(error.message).toBe("Invalid upload");
  });
});

describe("templates.create — client-direct-to-Blob finalize", () => {
  const BLOB_URL = "https://blob.example/templates/user-1/uuid-offer.docx";
  const BLOB_PATHNAME = "templates/user-1/uuid-offer.docx";

  beforeEach(() => {
    resetState();
    state.storedFiles = { [BLOB_URL]: Buffer.from(`${ZIP_MAGIC}dummy`) };
    // What storage reports actually lives at BLOB_URL — matches what the
    // client claims, except in the mismatch test below.
    state.statPathnames = { [BLOB_URL]: BLOB_PATHNAME };
  });

  it("rejects with UNAUTHORIZED when there is no session", async () => {
    state.session = null;
    const router = await importRouter();
    await expectORPCError(
      call(
        router.create,
        { blobUrl: BLOB_URL, blobPathname: BLOB_PATHNAME, originalFilename: "offer.docx" },
        ctx()
      ),
      "UNAUTHORIZED"
    );
  });

  it("rejects a blobPathname outside the templates/ prefix", async () => {
    const router = await importRouter();
    const error = await expectORPCError(
      call(
        router.create,
        { blobUrl: BLOB_URL, blobPathname: "other/uuid-offer.docx", originalFilename: "offer.docx" },
        ctx()
      ),
      "BAD_REQUEST"
    );
    expect(error.message).toBe("Invalid upload");
  });

  it("rejects a blobPathname whose user segment doesn't match the caller", async () => {
    const router = await importRouter();
    const error = await expectORPCError(
      call(
        router.create,
        {
          blobUrl: BLOB_URL,
          blobPathname: "templates/some-other-user/uuid-offer.docx",
          originalFilename: "offer.docx",
        },
        ctx()
      ),
      "BAD_REQUEST"
    );
    expect(error.message).toBe("Invalid upload");
  });

  it("rejects when the referenced original filename is not a .docx", async () => {
    const router = await importRouter();
    const error = await expectORPCError(
      call(
        router.create,
        { blobUrl: BLOB_URL, blobPathname: BLOB_PATHNAME, originalFilename: "offer.pdf" },
        ctx()
      ),
      "BAD_REQUEST"
    );
    expect(error.message).toBe("File must be a .docx document");
  });

  it("deletes the blob and rejects a stored file over the 10 MB size cap", async () => {
    state.storedFiles = { [BLOB_URL]: Buffer.concat([Buffer.from(ZIP_MAGIC), Buffer.alloc(10 * 1024 * 1024 + 1)]) };
    const router = await importRouter();
    const error = await expectORPCError(
      call(
        router.create,
        { blobUrl: BLOB_URL, blobPathname: BLOB_PATHNAME, originalFilename: "offer.docx" },
        ctx()
      ),
      "BAD_REQUEST"
    );
    expect(error.message).toContain("too large");
    expect(state.deletedBlobUrls).toContain(BLOB_URL);
  });

  it("rejects when the uploaded blob cannot be found", async () => {
    const router = await importRouter();
    const error = await expectORPCError(
      call(
        router.create,
        {
          blobUrl: "https://blob.example/templates/user-1/missing.docx",
          blobPathname: "templates/user-1/missing.docx",
          originalFilename: "offer.docx",
        },
        ctx()
      ),
      "BAD_REQUEST"
    );
    expect(error.message).toBe("Uploaded file not found");
  });

  it("deletes the blob and rejects a docx with no templated fields", async () => {
    state.extractFieldsResult = { fields: [], warnings: [] };
    const router = await importRouter();
    await expectORPCError(
      call(
        router.create,
        { blobUrl: BLOB_URL, blobPathname: BLOB_PATHNAME, originalFilename: "offer.docx" },
        ctx()
      ),
      "BAD_REQUEST"
    );
    expect(state.deletedBlobUrls).toContain(BLOB_URL);
  });

  it("rejects a blobUrl whose stored pathname isn't the one claimed, without deleting it", async () => {
    // The attacker knows someone else's blob url but pairs it with a pathname
    // under their own prefix, so the prefix check alone would pass.
    const VICTIM_URL = "https://blob.example/templates/victim/secret.docx";
    state.storedFiles[VICTIM_URL] = Buffer.from(`${ZIP_MAGIC}dummy`);
    state.statPathnames[VICTIM_URL] = "templates/victim/secret.docx";
    const router = await importRouter();

    const error = await expectORPCError(
      call(
        router.create,
        {
          blobUrl: VICTIM_URL,
          blobPathname: BLOB_PATHNAME,
          originalFilename: "offer.docx",
        },
        ctx()
      ),
      "BAD_REQUEST"
    );

    expect(error.message).toBe("Invalid upload");
    expect(state.insertedValues).toBeNull();
    // A rejected mismatch must not become a way to destroy another user's blob.
    expect(state.deletedBlobUrls).toEqual([]);
  });

  it("rejects the multipart shape, which belongs to a LOCAL_MODE deployment", async () => {
    const router = await importRouter();
    const error = await expectORPCError(
      call(router.create, { file: docxFile() }, ctx()),
      "BAD_REQUEST"
    );
    expect(error.message).toBe("Invalid upload");
  });

  it("stores the template referencing the already-uploaded blob", async () => {
    const router = await importRouter();
    const result = await call(
      router.create,
      {
        blobUrl: BLOB_URL,
        blobPathname: BLOB_PATHNAME,
        originalFilename: "offer.docx",
        name: "  Offer Letter  ",
      },
      ctx()
    );
    expect(result.template.name).toBe("Offer Letter");
    expect(result.template.blobUrl).toBe(BLOB_URL);
    expect(result.template.blobPathname).toBe(BLOB_PATHNAME);
    expect(state.insertedValues?.userId).toBe("user-1");
    expect(state.deletedBlobUrls).toEqual([]);
  });
});
