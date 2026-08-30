"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { TemplateField } from "@/db/schema";
import { BulkFillForm } from "@/components/bulk-fill-form";
import { formatRawTag } from "@/lib/template-tag";

const PREVIEW_DEBOUNCE_MS = 700;
const PREVIEW_DEBOUNCE_MS_FIRST = 150;
const FORM_WIDTH_STORAGE_KEY = "fillFormPaneWidth";
const FORM_WIDTH_MIN = 280;
const FORM_WIDTH_MAX = 800;
const FORM_WIDTH_DEFAULT = 420;

const inputClass =
  "rounded-md border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/30";

function defaultValueFor(field: TemplateField) {
  if (field.type === "boolean") return "false";
  return "";
}

/** Buckets fields by `group`, keeping each group's fields together (wherever
 * they appear in the template) while preserving each bucket's first-seen order. */
function groupFields(fields: TemplateField[]) {
  const order: string[] = [];
  const buckets = new Map<string, { groupLabel?: string; fields: TemplateField[] }>();
  fields.forEach((field, i) => {
    const bucketKey = field.group ?? `__ungrouped_${i}`;
    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = { groupLabel: field.groupLabel, fields: [] };
      buckets.set(bucketKey, bucket);
      order.push(bucketKey);
    }
    bucket.fields.push(field);
  });
  return order.map((bucketKey) => buckets.get(bucketKey)!);
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: TemplateField;
  value: string;
  onChange: (value: string) => void;
}) {
  switch (field.type) {
    case "number":
      return (
        <input
          id={field.key}
          type="number"
          step="any"
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      );
    case "date":
      return (
        <input
          id={field.key}
          type="date"
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      );
    case "boolean": {
      const checked = value === "true";
      return (
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <button
            id={field.key}
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(checked ? "false" : "true")}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30 dark:focus-visible:ring-white/40 ${
              checked ? "bg-black dark:bg-white" : "bg-black/20 dark:bg-white/20"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-black shadow transition-transform ${
                checked ? "translate-x-4.5" : "translate-x-0.5"
              }`}
            />
          </button>
          {field.params[0] && field.params[1]
            ? checked
              ? field.params[0]
              : field.params[1]
            : checked
              ? "Yes"
              : "No"}
        </label>
      );
    }
    case "select":
      return (
        <select
          id={field.key}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        >
          <option value="" disabled>
            Select…
          </option>
          {field.params.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    case "string":
    default:
      return (
        <input
          id={field.key}
          type="text"
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      );
  }
}

export function FillForm(props: { templateId: string; fields: TemplateField[]; templateName: string }) {
  const [mode, setMode] = useState<"single" | "bulk">("single");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 flex items-center gap-1 px-6 py-2 border-b border-black/10 dark:border-white/15">
        {(
          [
            { value: "single", label: "Fill one document" },
            { value: "bulk", label: "Create multiple from a spreadsheet" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setMode(tab.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === tab.value
                ? "bg-black text-white dark:bg-white dark:text-black"
                : "text-black/60 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {mode === "single" ? <SingleFillForm {...props} /> : <BulkFillForm {...props} />}
      </div>
    </div>
  );
}

function SingleFillForm({
  templateId,
  fields,
  templateName,
}: {
  templateId: string;
  fields: TemplateField[];
  templateName: string;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, defaultValueFor(f)]))
  );
  const [format, setFormat] = useState<"pdf" | "docx">("pdf");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const isFirstPreview = useRef(true);

  const [formWidth, setFormWidth] = useState(FORM_WIDTH_DEFAULT);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isResizing = useRef(false);

  useEffect(() => {
    const stored = Number(localStorage.getItem(FORM_WIDTH_STORAGE_KEY));
    if (stored >= FORM_WIDTH_MIN && stored <= FORM_WIDTH_MAX) setFormWidth(stored);
  }, []);

  const handleResizeMove = useCallback((e: PointerEvent) => {
    if (!isResizing.current || !containerRef.current) return;
    const left = containerRef.current.getBoundingClientRect().left;
    const width = Math.min(FORM_WIDTH_MAX, Math.max(FORM_WIDTH_MIN, e.clientX - left));
    setFormWidth(width);
  }, []);

  const stopResizing = useCallback(
    (e: PointerEvent) => {
      if (!isResizing.current) return;
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setFormWidth((current) => {
        localStorage.setItem(FORM_WIDTH_STORAGE_KEY, String(current));
        return current;
      });
      window.removeEventListener("pointermove", handleResizeMove);
      window.removeEventListener("pointerup", stopResizing);
      void e;
    },
    [handleResizeMove]
  );

  const startResizing = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      isResizing.current = true;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      // Fast drags can put the pointer over the preview <iframe>, which is a
      // separate document — plain window listeners stop receiving events
      // there. Pointer capture retargets events to this element regardless
      // of what's underneath, so the drag keeps tracking.
      e.currentTarget.setPointerCapture(e.pointerId);
      window.addEventListener("pointermove", handleResizeMove);
      window.addEventListener("pointerup", stopResizing);
    },
    [handleResizeMove, stopResizing]
  );

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handleResizeMove);
      window.removeEventListener("pointerup", stopResizing);
    };
  }, [handleResizeMove, stopResizing]);

  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  // Revoke the last preview blob URL on unmount to avoid leaking memory.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const delay = isFirstPreview.current ? PREVIEW_DEBOUNCE_MS_FIRST : PREVIEW_DEBOUNCE_MS;
    isFirstPreview.current = false;

    const timer = setTimeout(async () => {
      setIsPreviewLoading(true);
      try {
        const res = await fetch(`/api/templates/${templateId}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: values, preview: true }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setPreviewError(json.error ?? "Failed to update preview");
          return;
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setPreviewError(null);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setPreviewError("Failed to update preview");
        }
      } finally {
        setIsPreviewLoading(false);
      }
    }, delay);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [values, templateId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/templates/${templateId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: values, format }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Failed to generate document");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${templateName.replace(/[^a-zA-Z0-9-_]+/g, "_")}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to generate document");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div ref={containerRef} className="flex h-full min-h-0 flex-col lg:flex-row">
      <form
        onSubmit={handleSubmit}
        style={{ "--form-width": `${formWidth}px` } as CSSProperties}
        className="flex flex-col gap-4 p-6 overflow-y-auto lg:w-[var(--form-width)] lg:shrink-0 border-b lg:border-b-0 border-black/10 dark:border-white/15"
      >
        {groupFields(fields).map((bucket, i) => {
          const items = bucket.fields.map((field) => (
            <div key={field.key} className="flex flex-col gap-1.5">
              <label htmlFor={field.key} className="text-sm font-medium flex items-center gap-2">
                {field.label}
                <code className="text-[10px] normal-case tracking-normal text-black/40 dark:text-white/40 font-mono font-normal">
                  {formatRawTag(field)}
                </code>
                <span className="text-[10px] uppercase tracking-wide text-black/40 dark:text-white/40 font-normal">
                  {field.type}
                </span>
              </label>
              <FieldInput
                field={field}
                value={values[field.key] ?? ""}
                onChange={(value) => setValues((prev) => ({ ...prev, [field.key]: value }))}
              />
            </div>
          ));

          if (!bucket.groupLabel) return items;

          return (
            <fieldset
              key={bucket.groupLabel + i}
              className="flex flex-col gap-4 rounded-lg border border-black/10 dark:border-white/15 p-4"
            >
              <legend className="text-sm font-semibold px-1">{bucket.groupLabel}</legend>
              {items}
            </fieldset>
          );
        })}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {isSubmitting ? "Generating…" : `Download ${format.toUpperCase()}`}
          </button>
          <select
            aria-label="Download format"
            value={format}
            onChange={(e) => setFormat(e.target.value as "pdf" | "docx")}
            className={inputClass}
          >
            <option value="pdf">PDF</option>
            <option value="docx">Word (.docx)</option>
          </select>
        </div>
      </form>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize form panel"
        onPointerDown={startResizing}
        onDoubleClick={() => {
          setFormWidth(FORM_WIDTH_DEFAULT);
          localStorage.setItem(FORM_WIDTH_STORAGE_KEY, String(FORM_WIDTH_DEFAULT));
        }}
        className="hidden lg:flex w-2 shrink-0 cursor-col-resize items-center justify-center touch-none group"
      >
        <div className="h-full w-px bg-black/10 dark:bg-white/15 group-hover:bg-black/30 dark:group-hover:bg-white/40 group-active:bg-black/50 dark:group-active:bg-white/60 transition-colors" />
      </div>

      <div className="relative flex-1 min-h-[60vh] lg:min-h-0 bg-zinc-100 dark:bg-zinc-950">
        {previewUrl ? (
          <iframe
            src={previewUrl}
            title="Document preview"
            className="w-full h-full border-0"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-black/40 dark:text-white/40">
            {isPreviewLoading ? "Rendering preview…" : "Preview will appear here"}
          </div>
        )}

        {(isPreviewLoading || previewError) && (
          <div
            className={`absolute top-3 right-3 rounded-md px-3 py-1.5 text-xs font-medium shadow-sm ${
              previewError
                ? "bg-red-600 text-white"
                : "bg-black/80 text-white dark:bg-white/90 dark:text-black"
            }`}
          >
            {previewError ?? "Updating preview…"}
          </div>
        )}
      </div>
    </div>
  );
}
