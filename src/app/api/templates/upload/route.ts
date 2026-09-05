import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { DOCX_CONTENT_TYPE, MAX_TEMPLATE_UPLOAD_BYTES } from "@/lib/upload-limits";

// Issues short-lived client tokens so the browser can upload the .docx
// straight to Vercel Blob instead of through this Next.js function — the
// platform enforces a request body size limit on Functions independent of
// any app-level check, so routing large uploads through a function risks a
// FUNCTION_PAYLOAD_TOO_LARGE error before our own code ever runs.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const session = await auth.api.getSession({ headers: req.headers });
        if (!session) {
          throw new Error("Unauthorized");
        }
        // Binds the object's pathname to the uploading user so a blob URL
        // learned some other way (logs, a shared proxy, ...) can't be
        // registered as a template by a different user in `createFromBlob`.
        if (!pathname.startsWith(`templates/${session.user.id}/`)) {
          throw new Error("Invalid upload path");
        }
        return {
          allowedContentTypes: [DOCX_CONTENT_TYPE],
          maximumSizeInBytes: MAX_TEMPLATE_UPLOAD_BYTES,
          addRandomSuffix: true,
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 }
    );
  }
}
