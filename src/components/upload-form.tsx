"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function UploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a .docx file first");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    if (name.trim()) formData.append("name", name.trim());

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/templates", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Upload failed");
        return;
      }
      setName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      const warnings: string[] = json.warnings ?? [];
      const query = warnings.length
        ? `?warnings=${encodeURIComponent(JSON.stringify(warnings))}`
        : "";
      router.push(`/templates/${json.template.id}${query}`);
      router.refresh();
    } catch {
      setError("Upload failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-black/10 dark:border-white/15 p-6 flex flex-col gap-4"
    >
      <div>
        <h2 className="text-lg font-semibold">Upload a template</h2>
        <p className="text-sm text-black/60 dark:text-white/60 mt-1">
          Upload a .docx file with placeholders like{" "}
          <code className="px-1 py-0.5 rounded bg-black/5 dark:bg-white/10">
            {"{{field_name}}"}
          </code>{" "}
          — fields are detected automatically. Add a type after a pipe to
          control the input: {" "}
          <code className="px-1 py-0.5 rounded bg-black/5 dark:bg-white/10">
            {'{{birthday|date("yyyy-mm-dd")}}'}
          </code>
          . Supported types: <code className="font-mono">string</code>,{" "}
          <code className="font-mono">number(decimals)</code>,{" "}
          <code className="font-mono">{'date("yyyy-mm-dd")'}</code>,{" "}
          <code className="font-mono">boolean</code>, and{" "}
          <code className="font-mono">{'select("A","B")'}</code>. Untyped
          tags default to string. Prefix a key with a group and a dot to
          section related fields together on the form, e.g.{" "}
          <code className="px-1 py-0.5 rounded bg-black/5 dark:bg-white/10">
            {"{{person.first_name}}"}
          </code>{" "}
          and{" "}
          <code className="px-1 py-0.5 rounded bg-black/5 dark:bg-white/10">
            {'{{person.birthday|date("yyyy-mm-dd")}}'}
          </code>{" "}
          both appear under a &quot;Person&quot; section.
        </p>
        <a
          href="/example-template.docx"
          download
          className="mt-2 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-black dark:text-white underline underline-offset-2 hover:no-underline"
        >
          Download example template (.docx)
        </a>
      </div>

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
          className="rounded-md border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/30"
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
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-black/90 file:text-white dark:file:bg-white dark:file:text-black file:px-3 file:py-2 file:text-sm file:font-medium file:cursor-pointer cursor-pointer"
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="self-start rounded-md bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {isSubmitting ? "Uploading…" : "Upload template"}
      </button>
    </form>
  );
}
