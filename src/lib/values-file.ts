import type { TemplateField } from "@/db/schema";
import { downloadBlob } from "@/lib/download";
import { slugifyFilename } from "@/lib/slugify";

/**
 * The `{ fieldKey: value }` JSON file that the "Fill one document" tab exports
 * and imports. Submitted fill-link data is written in the same shape, so an
 * owner can pull a submission back into the form and carry on from there.
 */
export type ValuesFile = Record<string, string>;

/** Downloads `data` as `<template-name>.values.json`, one entry per template field. */
export function downloadValuesFile(
  templateName: string,
  fields: TemplateField[],
  data: ValuesFile
) {
  const values = Object.fromEntries(fields.map((f) => [f.key, data[f.key] ?? ""]));
  const blob = new Blob([JSON.stringify(values, null, 2)], { type: "application/json" });
  downloadBlob(blob, `${slugifyFilename(templateName)}.values.json`);
}

/**
 * Reads an exported values file back into form state, keeping only string
 * entries for fields this template actually has. Throws if `text` isn't a JSON
 * object.
 */
export function parseValuesFile(text: string, fields: TemplateField[]): ValuesFile {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Invalid values file");
  }
  const fieldKeys = new Set(fields.map((f) => f.key));
  const values: ValuesFile = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (fieldKeys.has(key) && typeof value === "string") values[key] = value;
  }
  return values;
}
