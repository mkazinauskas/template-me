"use client";

import type { EditableColumn } from "./row-helpers";

/**
 * A spreadsheet-like grid of rows, one column per {@link EditableColumn}, plus a
 * row number, a per-row remove button, and an "add row" affordance. Purely
 * controlled — every edit is reported back through `onRowsChange`.
 */
export function EditableRowsTable({
  columns,
  rows,
  onRowsChange,
  makeEmptyRow,
}: {
  columns: EditableColumn[];
  rows: Record<string, string>[];
  onRowsChange: (rows: Record<string, string>[]) => void;
  makeEmptyRow: () => Record<string, string>;
}) {
  function updateCell(rowIndex: number, key: string, value: string) {
    onRowsChange(rows.map((row, i) => (i === rowIndex ? { ...row, [key]: value } : row)));
  }
  function removeRow(rowIndex: number) {
    onRowsChange(rows.filter((_, i) => i !== rowIndex));
  }
  function addRow() {
    onRowsChange([...rows, makeEmptyRow()]);
  }

  return (
    <div className="h-full overflow-auto p-4">
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="text-left border-b border-black/10 dark:border-white/15 px-2 py-1.5 font-semibold w-8">
              #
            </th>
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-left border-b border-black/10 dark:border-white/15 px-2 py-1.5 font-semibold whitespace-nowrap"
              >
                <div className="flex items-center gap-1.5">
                  {col.label}
                  {col.sublabel && (
                    <code className="text-[10px] normal-case tracking-normal text-black/50 dark:text-white/50 font-mono font-normal">
                      {col.sublabel}
                    </code>
                  )}
                </div>
              </th>
            ))}
            <th className="border-b border-black/10 dark:border-white/15 px-2 py-1.5 w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="odd:bg-black/[0.02] dark:odd:bg-white/[0.03]">
              <td className="px-2 py-1.5 border-b border-black/5 dark:border-white/10 text-black/50 dark:text-white/50">
                {i + 1}
              </td>
              {columns.map((col) => (
                <td key={col.key} className="px-2 py-1.5 border-b border-black/5 dark:border-white/10">
                  {col.renderInput(row[col.key] ?? "", (value) => updateCell(i, col.key, value))}
                </td>
              ))}
              <td className="px-2 py-1.5 border-b border-black/5 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  aria-label={`Remove row ${i + 1}`}
                  className="text-black/40 dark:text-white/40 hover:text-red-600 dark:hover:text-red-400"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={addRow}
        className="mt-3 rounded-md border border-dashed border-black/20 dark:border-white/25 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-black/40 dark:hover:border-white/40 hover:text-black dark:hover:text-white"
      >
        + Add row
      </button>
    </div>
  );
}
