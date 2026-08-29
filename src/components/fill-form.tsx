"use client";

import { useEffect, useRef, useState } from "react";
import type { TemplateField } from "@/db/schema";

const PREVIEW_DEBOUNCE_MS = 700;
const PREVIEW_DEBOUNCE_MS_FIRST = 150;

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
    case "boolean":
      return (
        <label className="flex items-center gap-2 text-sm">
          <input
            id={field.key}
            type="checkbox"
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "false")}
            className="h-4 w-4"
          />
          {field.params[0] && field.params[1]
            ? value === "true"
              ? field.params[0]
              : field.params[1]
            : value === "true"
              ? "Yes"
              : "No"}
        </label>
      );
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

export function FillForm({
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const isFirstPreview = useRef(true);

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
        body: JSON.stringify({ data: values }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Failed to generate PDF");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${templateName.replace(/[^a-zA-Z0-9-_]+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to generate PDF");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 p-6 overflow-y-auto lg:w-[420px] lg:shrink-0 border-b lg:border-b-0 lg:border-r border-black/10 dark:border-white/15"
      >
        {groupFields(fields).map((bucket, i) => {
          const items = bucket.fields.map((field) => (
            <div key={field.key} className="flex flex-col gap-1.5">
              <label htmlFor={field.key} className="text-sm font-medium flex items-center gap-2">
                {field.label}
                <code className="text-[10px] normal-case tracking-normal text-black/40 dark:text-white/40 font-mono font-normal">
                  {field.key}
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

        <button
          type="submit"
          disabled={isSubmitting}
          className="self-start rounded-md bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {isSubmitting ? "Generating PDF…" : "Download PDF"}
        </button>
      </form>

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
