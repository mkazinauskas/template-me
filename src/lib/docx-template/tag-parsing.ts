import type { TemplateFieldType } from "@/db/schema";

const KNOWN_TYPES: TemplateFieldType[] = [
  "string",
  "number",
  "date",
  "boolean",
  "select",
  "checkbox",
  "textarea",
  "email",
  "url",
  "currency",
];

/** Turns a machine key like `first_name` or `firstName` into a display label ("First name"). */
export function toLabel(key: string): string {
  return key
    .replace(/[_.-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Splits a tag key like `person.first_name` into its group ("person") and the
 * remainder used for the field's own label ("first_name"). A key with no dot
 * (or a dot at the very start/end) has no group.
 */
export function splitGroup(key: string): { group?: string; localKey: string } {
  const dotIndex = key.indexOf(".");
  if (dotIndex <= 0 || dotIndex === key.length - 1) {
    return { localKey: key };
  }
  return { group: key.slice(0, dotIndex), localKey: key.slice(dotIndex + 1) };
}

// Maps each opening quote character to its matching closer, straight and
// curly alike — Word's autocorrect rewrites a typed "..." into curly “...”
// (and '...' into ‘...’) as soon as the template is saved, so a tag authored
// directly in Word never has straight quotes even though the user typed them.
const QUOTE_PAIRS: Record<string, string> = {
  '"': '"',
  "'": "'",
  "“": "”", // “ ”
  "‘": "’", // ‘ ’
};

/** Splits `a, "b, c", 'd'` into ["a", "b, c", "d"], stripping quotes (straight or curly) and empty entries. */
function parseArgs(argsStr: string): string[] {
  const args: string[] = [];
  let current = "";
  let closingQuote: string | null = null;

  for (const char of argsStr) {
    if (closingQuote) {
      if (char === closingQuote) closingQuote = null;
      else current += char;
    } else if (char in QUOTE_PAIRS) {
      closingQuote = QUOTE_PAIRS[char];
    } else if (char === ",") {
      args.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  const last = current.trim();
  if (last !== "" || args.length > 0) args.push(last);
  return args.filter((a) => a !== "");
}

export type ParsedTag = {
  key: string;
  type: TemplateFieldType;
  params: string[];
  unrecognized?: string;
};

/**
 * Parses a raw tag body like `birthday|date("yyyy-mm-dd")` into its field key,
 * type, and type arguments. A bare `{{key}}` (no `|type`) defaults to "string".
 * An unrecognized type name (or unparsable type expression) falls back to
 * "string" so the tag still renders as plain text instead of breaking the
 * upload — `unrecognized` is set in that case so the caller can surface a
 * warning about it.
 */
export function parseTag(raw: string): ParsedTag {
  const trimmed = raw.trim();
  const pipeIndex = trimmed.indexOf("|");
  if (pipeIndex === -1) {
    return { key: trimmed, type: "string", params: [] };
  }

  const key = trimmed.slice(0, pipeIndex).trim();
  const typeExpr = trimmed.slice(pipeIndex + 1).trim();
  const match = typeExpr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\(([^]*)\))?$/);
  if (!match) {
    return { key, type: "string", params: [], unrecognized: typeExpr };
  }

  const [, typeName, argsStr] = match;
  const normalized = typeName.toLowerCase() as TemplateFieldType;
  const params = argsStr ? parseArgs(argsStr) : [];
  if (!KNOWN_TYPES.includes(normalized)) {
    return { key, type: "string", params, unrecognized: typeName };
  }
  return { key, type: normalized, params };
}
