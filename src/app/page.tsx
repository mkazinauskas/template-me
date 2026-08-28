import { Suspense } from "react";
import { UploadForm } from "@/components/upload-form";
import { TemplateList } from "@/components/template-list";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-3xl px-6 py-16 flex flex-col gap-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Docx Template → PDF
          </h1>
          <p className="text-sm text-black/60 dark:text-white/60 mt-1">
            Upload a Word template, fill in the detected fields, and download
            a filled-in PDF.
          </p>
        </div>

        <UploadForm />

        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Templates</h2>
          <Suspense fallback={<p className="text-sm text-black/50">Loading…</p>}>
            <TemplateList />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
