"use client";

import { useState } from "react";
import type { TemplateField } from "@/db/schema";
import { BulkFillForm } from "@/components/bulk-fill-form";
import { SingleFillForm } from "@/components/fill-form/single-fill-form";
import { FillRequestsPanel } from "@/components/fill-form/fill-requests-panel";

const MODE_TABS = [
  { value: "single", label: "Fill one document" },
  { value: "bulk", label: "Create multiple from a spreadsheet" },
  { value: "send", label: "Send a link to fill in", ownerOnly: true },
] as const;

type FillMode = (typeof MODE_TABS)[number]["value"];

/**
 * Lets the user fill one document via a form, fill many at once from a
 * spreadsheet, or (owners only) generate one-time links that let someone else
 * fill in the data without ever seeing the document.
 */
export function FillForm(props: {
  templateId: string;
  fields: TemplateField[];
  templateName: string;
  isOwner?: boolean;
}) {
  const { isOwner = false, ...formProps } = props;
  const [mode, setMode] = useState<FillMode>("single");
  const tabs = MODE_TABS.filter((tab) => !("ownerOnly" in tab) || isOwner);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 flex items-center gap-1 px-6 py-2 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setMode(tab.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === tab.value
                ? "bg-black text-white dark:bg-white dark:text-black"
                : "text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {mode === "single" ? (
          <SingleFillForm {...formProps} />
        ) : mode === "bulk" ? (
          <BulkFillForm {...formProps} />
        ) : (
          <FillRequestsPanel {...formProps} />
        )}
      </div>
    </div>
  );
}
