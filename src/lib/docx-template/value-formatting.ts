import type { TemplateField } from "@/db/schema";

const CHECKED_BOX = "☒";
const UNCHECKED_BOX = "☐";

/**
 * The truthy string synonyms accepted for boolean/checkbox fields. Kept in one
 * place (behind {@link isTruthyValue}) so every part of the pipeline agrees on
 * what counts as "checked".
 */
const TRUTHY_VALUES = new Set(["true", "on", "1", "yes", "y"]);

/** Whether a raw string value (case-insensitively) represents "true" for a boolean/checkbox field. */
export function isTruthyValue(value: string): boolean {
  return TRUTHY_VALUES.has(value.trim().toLowerCase());
}

/** Reformats an ISO `yyyy-mm-dd` (from an <input type="date">) per a format string using yyyy/mm/dd tokens. */
function formatDate(isoDate: string, format: string): string {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  const yyyy = String(parsed.getFullYear());
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return format.replace(/yyyy/gi, yyyy).replace(/mm/gi, mm).replace(/dd/gi, dd);
}

/** Formats a raw form value according to the field's type before injection into the docx. */
export function formatFieldValue(field: TemplateField, rawValue: string): string {
  switch (field.type) {
    case "number": {
      if (rawValue.trim() === "") return "";
      const decimals = field.params[0] !== undefined ? parseInt(field.params[0], 10) : undefined;
      const num = Number(rawValue);
      if (Number.isNaN(num)) return rawValue;
      return decimals !== undefined && !Number.isNaN(decimals) ? num.toFixed(decimals) : String(num);
    }
    case "date": {
      const format = field.params[0] || "yyyy-mm-dd";
      return formatDate(rawValue, format);
    }
    case "boolean": {
      const [trueLabel = "Yes", falseLabel = "No"] = field.params;
      return isTruthyValue(rawValue) ? trueLabel : falseLabel;
    }
    case "checkbox":
      return isTruthyValue(rawValue) ? CHECKED_BOX : UNCHECKED_BOX;
    case "select":
    case "string":
    default:
      return rawValue;
  }
}
