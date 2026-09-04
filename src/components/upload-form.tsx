"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { PlaceholderTypes } from "@/components/placeholder-types";
import { inputClasses } from "@/components/ui/input";
import { buttonClasses } from "@/components/ui/button";

const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * `localMode` mirrors the server's `LOCAL_MODE` env var (Docker Compose,
 * local-disk storage — no real Vercel Blob token available), so that path
 * keeps posting the file straight to the API route. Everywhere else, the
 * file goes directly from the browser to Blob storage: Vercel enforces a
 * request body size limit on Functions independent of any app-level check,
 * so routing the raw file through this route risks a FUNCTION_PAYLOAD_TOO_LARGE
 * error before the app's own size check ever runs.
 */
export function UploadForm({ localMode }: { localMode: boolean }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFile, setHasFile] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setHasFile(!!file);
    if (file && !name.trim()) {
      setName(file.name.replace(/\.docx$/i, ""));
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a .docx file first");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = localMode ? await uploadViaFormData(file, name) : await uploadViaBlob(file, name);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Upload failed");
        return;
      }
      setName("");
      setHasFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      const warnings: string[] = json.warnings ?? [];
      const query = warnings.length
        ? `?warnings=${encodeURIComponent(JSON.stringify(warnings))}`
        : "";
      router.push(`/client/dashboard/templates/${json.template.id}${query}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  function uploadViaFormData(file: File, name: string) {
    const formData = new FormData();
    formData.append("file", file);
    if (name.trim()) formData.append("name", name.trim());
    return fetch("/api/templates", { method: "POST", body: formData });
  }

  async function uploadViaBlob(file: File, name: string) {
    const blob = await upload(`templates/${crypto.randomUUID()}-${file.name}`, file, {
      access: "private",
      contentType: DOCX_CONTENT_TYPE,
      handleUploadUrl: "/api/templates/upload",
    });
    return fetch("/api/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        blobUrl: blob.url,
        blobPathname: blob.pathname,
        originalFilename: file.name,
        name: name.trim(),
      }),
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-describedby={error ? "form-error" : undefined}
      className="rounded-xl border border-border p-6 flex flex-col gap-4"
    >
      <div>
        <h2 className="text-lg font-semibold">Upload a template</h2>
        <a
          href="/example-template.docx"
          download
          className="mt-2 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-black dark:text-white underline underline-offset-2 hover:no-underline"
        >
          Download example template (.docx)
        </a>
      </div>

      <PlaceholderTypes />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium">
          Template name (optional)
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Offer Letter"
          className={inputClasses}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="file" className="text-sm font-medium">
          Word document (.docx)
        </label>
        <input
          id="file"
          ref={fileInputRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileChange}
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-black/90 file:text-white dark:file:bg-white dark:file:text-black file:px-3 file:py-2 file:text-sm file:font-medium file:cursor-pointer cursor-pointer"
        />
      </div>

      {error && (
        <p id="form-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting || !hasFile}
        className={buttonClasses({ className: "self-start" })}
      >
        {isSubmitting ? "Uploading…" : "Upload template"}
      </button>
    </form>
  );
}
