import { useEffect } from "react";
import type { TemplateField } from "@/db/schema";
import {
  BULK_STATE_STORAGE_PREFIX,
  type BulkSource,
  type OutputFormat,
  type PersistedBulkState,
} from "./row-helpers";

type BulkStateSlice = {
  source: BulkSource;
  fileName: string | null;
  headers: string[];
  csvRows: Record<string, string>[];
  mapping: Record<string, string>;
  editRows: Record<string, string>[];
  nameField: string;
  format: OutputFormat;
};

type BulkStateSetters = {
  setSource: (value: BulkSource) => void;
  setFileName: (value: string | null) => void;
  setHeaders: (value: string[]) => void;
  setCsvRows: (value: Record<string, string>[]) => void;
  setMapping: (value: Record<string, string>) => void;
  setEditRows: (value: Record<string, string>[]) => void;
  setNameField: (value: string) => void;
  setFormat: (value: OutputFormat) => void;
};

/**
 * Restores this template's bulk-fill setup on mount and writes it back on every
 * change, so navigating away and back (or a reload) doesn't lose the uploaded
 * rows, column mapping, or chosen options.
 */
export function usePersistedBulkState(
  templateId: string,
  fields: TemplateField[],
  fallbackNameField: string,
  state: BulkStateSlice,
  setters: BulkStateSetters
) {
  const storageKey = BULK_STATE_STORAGE_PREFIX + templateId;

  // Restore is deferred to after mount (rather than a lazy useState initializer)
  // so the first client render matches the server-rendered defaults — reading
  // localStorage during the initial render would cause a hydration mismatch.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Partial<PersistedBulkState>;
      const fieldKeys = new Set(fields.map((f) => f.key));

      if (parsed.source) setters.setSource(parsed.source);
      if (parsed.fileName !== undefined) setters.setFileName(parsed.fileName);
      if (parsed.headers) setters.setHeaders(parsed.headers);
      if (parsed.csvRows) setters.setCsvRows(parsed.csvRows);
      if (parsed.mapping) {
        // The template may have been edited (fields renamed/removed) since this
        // mapping was persisted — drop entries pointing at field keys that no
        // longer exist so we don't silently reference stale fields.
        setters.setMapping(
          Object.fromEntries(
            Object.entries(parsed.mapping).filter(([fieldKey]) => fieldKeys.has(fieldKey))
          )
        );
      }
      if (parsed.editRows && parsed.editRows.length > 0) setters.setEditRows(parsed.editRows);
      // Only restore nameField if it's still a valid field key; otherwise fall
      // back to the same default used on first mount, since a stale value would
      // silently fail to match any <option> in the select.
      if (parsed.nameField && fieldKeys.has(parsed.nameField)) {
        setters.setNameField(parsed.nameField);
      } else if (parsed.nameField) {
        setters.setNameField(fallbackNameField);
      }
      if (parsed.format) setters.setFormat(parsed.format);
    } catch {
      // Ignore malformed/unavailable storage and fall back to defaults.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    const snapshot: PersistedBulkState = {
      source: state.source,
      fileName: state.fileName,
      headers: state.headers,
      csvRows: state.csvRows,
      mapping: state.mapping,
      editRows: state.editRows,
      nameField: state.nameField,
      format: state.format,
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(snapshot));
    } catch {
      // Ignore storage failures (e.g. private browsing quota).
    }
  }, [
    storageKey,
    state.source,
    state.fileName,
    state.headers,
    state.csvRows,
    state.mapping,
    state.editRows,
    state.nameField,
    state.format,
  ]);
}
