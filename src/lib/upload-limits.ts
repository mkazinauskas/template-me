// Shared between the classic multipart upload path (src/app/api/templates/route.ts)
// and the client-direct-to-Blob path (src/app/api/templates/upload/route.ts), so
// both enforce the same cap and content type.
export const MAX_TEMPLATE_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
