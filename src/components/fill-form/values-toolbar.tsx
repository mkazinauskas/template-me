"use client";

import { useRef } from "react";

/** Export / import / clear controls for the whole set of field values. */
export function ValuesToolbar({
  onExport,
  onImport,
  onClear,
}: {
  onExport: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}) {
  const importInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="flex items-center gap-3 text-sm pb-2 border-b border-border">
      <button
        type="button"
        onClick={onExport}
        className="text-muted-foreground underline-offset-2 hover:underline"
      >
        Export values
      </button>
      <button
        type="button"
        onClick={() => importInputRef.current?.click()}
        className="text-muted-foreground underline-offset-2 hover:underline"
      >
        Import values
      </button>
      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        onChange={onImport}
        className="hidden"
      />
      <button
        type="button"
        onClick={onClear}
        className="ml-auto text-muted-foreground underline-offset-2 hover:underline"
      >
        Clear values
      </button>
    </div>
  );
}
