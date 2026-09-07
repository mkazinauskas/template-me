"use client";

import { useEffect, useRef, useState } from "react";
import type { TemplateField } from "@/db/schema";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/input";
import { groupFields } from "@/components/fill-form/field-grouping";

/** What the owner is asking for on a new link. */
export type FillLinkDraft = {
  /** The field keys to request. Never empty — the Create button waits for one. */
  fieldKeys: string[];
  title: string;
  message: string;
};

function FieldCheckbox({
  field,
  checked,
  onToggle,
}: {
  field: TemplateField;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-1 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
        className="size-4 shrink-0 accent-black dark:accent-white"
      />
      <span className="min-w-0 truncate">{field.label}</span>
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
        {field.type}
      </span>
    </label>
  );
}

/**
 * The "New link" step: pick which of the template's questions the recipient
 * is asked, and optionally write your own title and note to go above them.
 * Every field starts selected, so the quickest path through — open, Create —
 * produces the same all-fields link this button used to make in one click.
 *
 * A hand-rolled overlay rather than a `<dialog>`: the app has no dialog
 * primitive yet, and this needs nothing `<dialog>` would give it beyond the
 * Escape/backdrop dismissal and focus handling below.
 */
export function NewFillLinkDialog({
  fields,
  isCreating,
  error,
  onCancel,
  onCreate,
}: {
  fields: TemplateField[];
  isCreating: boolean;
  error: string | null;
  onCancel: () => void;
  onCreate: (draft: FillLinkDraft) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(fields.map((f) => f.key)));
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  function toggle(key: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  const allSelected = selected.size === fields.length;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selected.size === 0) return;
    onCreate({
      // Template order, not click order, so the link's questions read the
      // same way as the document they fill.
      fieldKeys: fields.filter((f) => selected.has(f.key)).map((f) => f.key),
      title,
      message,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      // A click that starts inside the panel and ends on the backdrop (a
      // dragged text selection) shouldn't discard the draft, so dismiss only
      // when the backdrop itself is both press and release target.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-fill-link-heading"
        onSubmit={handleSubmit}
        className="flex max-h-full w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-background p-6 shadow-xl"
      >
        <div>
          <h2 id="new-fill-link-heading" className="text-base font-semibold tracking-tight">
            New fill link
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose what to ask for, and add a note if you want to explain it.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="fill-link-title" className="text-sm font-medium">
            Title <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id="fill-link-title"
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="Shown as the heading on the link"
            className={inputClasses}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="fill-link-message" className="text-sm font-medium">
            Message <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <textarea
            id="fill-link-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Anything the person filling this in should know"
            className={`${inputClasses} resize-y`}
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <legend className="text-sm font-medium">Questions to ask</legend>
            <button
              type="button"
              onClick={() =>
                setSelected(allSelected ? new Set() : new Set(fields.map((f) => f.key)))
              }
              className="text-sm text-muted-foreground hover:underline"
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
          </div>

          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-lg border border-border p-3">
            {groupFields(fields).map((bucket, i) =>
              bucket.groupLabel ? (
                <div key={bucket.groupLabel + i} className="flex flex-col">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {bucket.groupLabel}
                  </span>
                  {bucket.fields.map((field) => (
                    <FieldCheckbox
                      key={field.key}
                      field={field}
                      checked={selected.has(field.key)}
                      onToggle={(checked) => toggle(field.key, checked)}
                    />
                  ))}
                </div>
              ) : (
                bucket.fields.map((field) => (
                  <FieldCheckbox
                    key={field.key}
                    field={field}
                    checked={selected.has(field.key)}
                    onToggle={(checked) => toggle(field.key, checked)}
                  />
                ))
              )
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            {selected.size === 0
              ? "Pick at least one question."
              : `${selected.size} of ${fields.length} selected.`}
          </p>
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isCreating}
            className="text-sm text-muted-foreground hover:underline disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isCreating || selected.size === 0}
            className={buttonClasses({ size: "sm" })}
          >
            {isCreating ? "Creating…" : "Create link"}
          </button>
        </div>
      </form>
    </div>
  );
}
