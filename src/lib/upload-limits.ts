// Shared between the `templates.create` procedure (both its multipart-file and
// client-direct-to-Blob paths, in src/server/orpc/routers/templates.ts) and the
// Blob client-token route (src/app/api/templates/upload/route.ts), so every
// upload path enforces the same cap and content type.
export const MAX_TEMPLATE_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
