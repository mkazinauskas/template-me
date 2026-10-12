"use client";

import { useCallback, useEffect, useState } from "react";
import type { FillLinkPreset } from "@/db/schema";
import { orpc, orpcErrorMessage } from "@/lib/orpc";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/input";
import { InlineConfirm } from "@/components/ui/inline-confirm";

/** The caller's saved title/message presets, plus the mutations that keep the list in sync. */
export function useFillLinkPresets() {
  const [presets, setPresets] = useState<FillLinkPreset[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    orpc.fillLinkPresets
      .list()
      .then(({ presets }) => {
        if (!cancelled) setPresets(presets);
      })
      .catch((err) => {
        if (!cancelled)
          setLoadError(orpcErrorMessage(err, "Failed to load presets"));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sortIn = useCallback((preset: FillLinkPreset) => {
    setPresets((current) =>
      [...(current ?? []).filter((p) => p.id !== preset.id), preset].sort(
        (a, b) => a.name.localeCompare(b.name),
      ),
    );
  }, []);

  const create = useCallback(
    async (input: PresetFields) => {
      const { preset } = await orpc.fillLinkPresets.create(input);
      sortIn(preset);
      return preset;
    },
    [sortIn],
  );

  const update = useCallback(
    async (id: string, input: PresetFields) => {
      const { preset } = await orpc.fillLinkPresets.update({ id, ...input });
      sortIn(preset);
      return preset;
    },
    [sortIn],
  );

  const remove = useCallback(async (id: string) => {
    await orpc.fillLinkPresets.delete({ id });
    setPresets((current) => current?.filter((p) => p.id !== id) ?? current);
  }, []);

  return { presets, loadError, create, update, remove };
}

export type FillLinkPresets = ReturnType<typeof useFillLinkPresets>;

type PresetFields = { name: string; title: string; message: string };

function PresetEditor({
  initial,
  submitLabel,
  onSave,
  onCancel,
}: {
  initial: PresetFields;
  submitLabel: string;
  onSave: (fields: PresetFields) => Promise<void>;
  onCancel: () => void;
}) {
  const [fields, setFields] = useState(initial);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave =
    fields.name.trim() !== "" &&
    fields.title.trim() !== "" &&
    fields.message.trim() !== "";

  async function save() {
    if (!canSave) return;
    setIsSaving(true);
    setError(null);
    try {
      await onSave(fields);
    } catch (err) {
      setError(orpcErrorMessage(err, "Failed to save preset"));
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <input
        aria-label="Preset name"
        value={fields.name}
        onChange={(e) => setFields({ ...fields, name: e.target.value })}
        maxLength={100}
        placeholder="Preset name, e.g. New hire onboarding"
        className={inputClasses}
        autoFocus
      />
      <input
        aria-label="Preset title"
        value={fields.title}
        onChange={(e) => setFields({ ...fields, title: e.target.value })}
        maxLength={200}
        placeholder="Title"
        className={inputClasses}
      />
      <textarea
        aria-label="Preset message"
        value={fields.message}
        onChange={(e) => setFields({ ...fields, message: e.target.value })}
        maxLength={2000}
        rows={3}
        placeholder="Message"
        className={`${inputClasses} resize-y`}
      />
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="text-sm text-muted-foreground hover:underline disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={isSaving || !canSave}
          className={buttonClasses({ size: "sm" })}
        >
          {isSaving ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * The "Manage presets" view of the new-link dialog: every saved preset, each
 * editable or deletable in place, plus a "New preset" entry at the top.
 */
export function FillLinkPresetManager({
  store,
  onDone,
}: {
  store: FillLinkPresets;
  onDone: () => void;
}) {
  const { presets, loadError, create, update, remove } = store;
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(preset: FillLinkPreset) {
    setError(null);
    try {
      await remove(preset.id);
      if (editingId === preset.id) setEditingId(null);
    } catch (err) {
      setError(orpcErrorMessage(err, "Failed to delete preset"));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2
            id="new-fill-link-heading"
            className="text-base font-semibold tracking-tight"
          >
            Title &amp; message presets
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Save the wording you send often and pick it when creating a link.
          </p>
        </div>
        {editingId !== "new" && (
          <button
            type="button"
            onClick={() => setEditingId("new")}
            className={buttonClasses({
              variant: "secondary",
              size: "sm",
              className: "shrink-0",
            })}
          >
            New preset
          </button>
        )}
      </div>

      {editingId === "new" && (
        <PresetEditor
          initial={{ name: "", title: "", message: "" }}
          submitLabel="Create preset"
          onCancel={() => setEditingId(null)}
          onSave={async (fields) => {
            await create(fields);
            setEditingId(null);
          }}
        />
      )}

      {(loadError || error) && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {loadError ?? error}
        </p>
      )}

      {presets === null ? (
        !loadError && <p className="text-sm text-muted-foreground">Loading…</p>
      ) : presets.length === 0 ? (
        editingId !== "new" && (
          <p className="text-sm text-muted-foreground">
            No presets yet — create one to reuse it.
          </p>
        )
      ) : (
        <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {presets.map((preset) =>
            editingId === preset.id ? (
              <li key={preset.id}>
                <PresetEditor
                  initial={{
                    name: preset.name,
                    title: preset.title,
                    message: preset.message,
                  }}
                  submitLabel="Save changes"
                  onCancel={() => setEditingId(null)}
                  onSave={async (fields) => {
                    await update(preset.id, fields);
                    setEditingId(null);
                  }}
                />
              </li>
            ) : (
              <li
                key={preset.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{preset.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {preset.title}
                  </p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {preset.message}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingId(preset.id)}
                    className="text-sm text-muted-foreground hover:underline"
                  >
                    Edit
                  </button>
                  <InlineConfirm
                    label="Delete"
                    pendingLabel="Deleting…"
                    onConfirm={() => handleDelete(preset)}
                  />
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDone}
          className={buttonClasses({ size: "sm" })}
        >
          Back to link
        </button>
      </div>
    </div>
  );
}

/**
 * The preset row at the top of the new-link form: pick a saved preset to fill
 * the title and message, save what's typed as a new preset (or overwrite the
 * picked one), or jump to the manager.
 */
export function FillLinkPresetPicker({
  store,
  title,
  message,
  onApply,
  onManage,
}: {
  store: FillLinkPresets;
  title: string;
  message: string;
  onApply: (fields: { title: string; message: string }) => void;
  onManage: () => void;
}) {
  const { presets, create, update } = store;
  const [selectedId, setSelectedId] = useState("");
  const [isNaming, setIsNaming] = useState(false);
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = presets?.find((p) => p.id === selectedId) ?? null;
  const hasText = title.trim() !== "" && message.trim() !== "";
  const isDirty =
    selected !== null &&
    (title.trim() !== selected.title || message.trim() !== selected.message);

  function pick(id: string) {
    setSelectedId(id);
    setError(null);
    // "Custom" starts from a blank slate rather than keeping the last preset's text.
    const preset = presets?.find((p) => p.id === id);
    onApply({ title: preset?.title ?? "", message: preset?.message ?? "" });
  }

  async function run(action: () => Promise<FillLinkPreset>) {
    setIsSaving(true);
    setError(null);
    try {
      const preset = await action();
      setSelectedId(preset.id);
      setIsNaming(false);
      setName("");
    } catch (err) {
      setError(orpcErrorMessage(err, "Failed to save preset"));
    } finally {
      setIsSaving(false);
    }
  }

  const saveNew = () =>
    run(() => create({ name: name.trim(), title, message }));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="fill-link-preset" className="text-sm font-medium">
          Preset
        </label>
        <button
          type="button"
          onClick={onManage}
          className="text-sm text-muted-foreground hover:underline"
        >
          Manage presets
        </button>
      </div>

      <div className="flex items-center gap-2">
        <select
          id="fill-link-preset"
          value={selectedId}
          onChange={(e) => pick(e.target.value)}
          disabled={presets === null}
          className={`${inputClasses} min-w-0 flex-1`}
        >
          <option value="">
            {presets === null
              ? "Loading…"
              : presets.length === 0
                ? "No presets yet"
                : "Custom"}
          </option>
          {presets?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {selected && isDirty && (
          <button
            type="button"
            onClick={() =>
              run(() =>
                update(selected.id, { name: selected.name, title, message }),
              )
            }
            disabled={isSaving || !hasText}
            className={buttonClasses({
              variant: "secondary",
              size: "sm",
              className: "shrink-0",
            })}
          >
            Update preset
          </button>
        )}
        {!isNaming && (
          <button
            type="button"
            onClick={() => {
              setIsNaming(true);
              setError(null);
            }}
            disabled={!hasText}
            title={hasText ? undefined : "Write a title and message first"}
            className={buttonClasses({
              variant: "secondary",
              size: "sm",
              className: "shrink-0",
            })}
          >
            Save as new
          </button>
        )}
      </div>

      {isNaming && (
        <div className="flex items-center gap-2">
          <input
            aria-label="New preset name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              // Enter would otherwise submit the surrounding link form.
              if (e.key === "Enter") {
                e.preventDefault();
                if (name.trim()) saveNew();
              } else if (e.key === "Escape") {
                e.stopPropagation();
                setIsNaming(false);
              }
            }}
            maxLength={100}
            placeholder="Name this preset"
            className={`${inputClasses} min-w-0 flex-1`}
            autoFocus
          />
          <button
            type="button"
            onClick={() => setIsNaming(false)}
            disabled={isSaving}
            className="shrink-0 text-sm text-muted-foreground hover:underline disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={saveNew}
            disabled={isSaving || !name.trim() || !hasText}
            className={buttonClasses({ size: "sm", className: "shrink-0" })}
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
