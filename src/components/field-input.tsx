import type { TemplateField } from "@/db/schema";
import { inputClasses, compactInputClasses } from "@/components/ui/input";

const checkboxClasses = "h-4 w-4 rounded border-black/25 dark:border-white/30 accent-black dark:accent-white";

function toggleTrackClasses(checked: boolean) {
  return `relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30 dark:focus-visible:ring-white/40 ${
    checked ? "bg-black dark:bg-white" : "bg-black/20 dark:bg-white/20"
  }`;
}

function toggleThumbClasses(checked: boolean) {
  return `inline-block h-4 w-4 transform rounded-full bg-white dark:bg-black shadow transition-transform ${
    checked ? "translate-x-4.5" : "translate-x-0.5"
  }`;
}

/**
 * Renders the right input for a template field's type (text/number/date/
 * boolean toggle/checkbox/select). Shared by the single fill form (which
 * gives every field a stable `id` so its `<label htmlFor>` works, and marks
 * fields `required`) and the bulk fill form's per-row table cells (which
 * instead pass `aria-label` — a table cell has no room for a `<label>` — and
 * leave fields optional, since a row can be edited incrementally).
 */
export function FieldInput({
  field,
  value,
  onChange,
  id,
  "aria-label": ariaLabel,
  required = false,
  className,
}: {
  field: TemplateField;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  "aria-label"?: string;
  required?: boolean;
  className?: string;
}) {
  const fieldClasses = className ?? (id ? inputClasses : compactInputClasses);
  const idProps = id ? { id } : { "aria-label": ariaLabel ?? field.label };

  switch (field.type) {
    case "number":
      return (
        <input
          {...idProps}
          type="number"
          step="any"
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={fieldClasses}
        />
      );
    case "date":
      return (
        <input
          {...idProps}
          type="date"
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={fieldClasses}
        />
      );
    case "boolean": {
      const checked = value === "true";
      const toggle = (
        <button
          {...idProps}
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(checked ? "false" : "true")}
          className={toggleTrackClasses(checked)}
        >
          <span className={toggleThumbClasses(checked)} />
        </button>
      );
      // Only the labelled (single-fill) variant shows the on/off text next
      // to the switch — a table cell has no room for it.
      if (!id) return toggle;
      const [onLabel, offLabel] =
        field.params[0] && field.params[1] ? field.params : ["Yes", "No"];
      return (
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          {toggle}
          {checked ? onLabel : offLabel}
        </label>
      );
    }
    case "checkbox":
      return (
        <input
          {...idProps}
          type="checkbox"
          checked={value === "true"}
          onChange={(e) => onChange(e.target.checked ? "true" : "false")}
          className={checkboxClasses}
        />
      );
    case "select":
      return (
        <select
          {...idProps}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={fieldClasses}
        >
          <option value="" disabled={required}>
            {required ? "Select…" : "—"}
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
          {...idProps}
          type="text"
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={fieldClasses}
        />
      );
  }
}
