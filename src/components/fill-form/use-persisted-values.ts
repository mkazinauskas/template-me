import { useCallback, useEffect, useState } from "react";
import type { TemplateField } from "@/db/schema";
import { blankValues } from "./field-grouping";

const FORM_VALUES_STORAGE_PREFIX = "fillFormValues:";

/**
 * Holds the single-fill form's field values and mirrors them to localStorage so
 * a reload or a trip back to the template list doesn't lose what was typed in.
 *
 * `persist` writes synchronously (in the same event as the state update) rather
 * than from a useEffect reacting to `values`: an effect's write is deferred to a
 * passive-effect pass, which a browser refresh triggered right after typing can
 * interrupt before it ever runs, silently dropping the last edit.
 */
export function usePersistedValues(templateId: string, fields: TemplateField[]) {
  const storageKey = FORM_VALUES_STORAGE_PREFIX + templateId;
  const [values, setValues] = useState<Record<string, string>>(() => blankValues(fields));

  const persist = useCallback(
    (next: Record<string, string>) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Ignore storage failures (e.g. private browsing quota).
      }
    },
    [storageKey]
  );

  // Restore is deferred to after mount (rather than a lazy useState initializer)
  // so the first client render matches the server-rendered defaults — reading
  // localStorage during the initial render would cause a hydration mismatch.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Record<string, string>;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValues((prev) => ({ ...prev, ...parsed }));
    } catch {
      // Ignore malformed/unavailable storage and fall back to defaults.
    }
  }, [storageKey]);

  return { values, setValues, persist };
}
