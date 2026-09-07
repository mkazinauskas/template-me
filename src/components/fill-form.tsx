import Link from "next/link";
import type { TemplateField } from "@/db/schema";
import { FILL_MODES, type FillMode } from "@/lib/template-routes";
import { BulkFillForm } from "@/components/bulk-fill-form";
import { SingleFillForm } from "@/components/fill-form/single-fill-form";
import { FillRequestsPanel } from "@/components/fill-form/fill-requests-panel";

/**
 * The mode switcher plus the panel for the mode currently routed to: fill one
 * document via a form, fill many at once from a spreadsheet, or (owners only)
 * generate one-time links that let someone else fill in the data without ever
 * seeing the document. Each mode is its own URL, so a mode is linkable,
 * bookmarkable, and survives a reload.
 */
export function FillForm({
  mode,
  basePath,
  isOwner = false,
  ...formProps
}: {
  templateId: string;
  fields: TemplateField[];
  templateName: string;
  /** Which mode's route is being rendered. */
  mode: FillMode;
  /** This template's own path, e.g. `/public/templates/t1`, that modes hang off. */
  basePath: string;
  isOwner?: boolean;
}) {
  const tabs = FILL_MODES.filter((tab) => !tab.ownerOnly || isOwner);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav
        aria-label="Fill mode"
        className="shrink-0 flex items-center gap-1 px-6 py-2 border-b border-border"
      >
        {tabs.map((tab) => (
          <Link
            key={tab.value}
            href={`${basePath}${tab.segment}`}
            aria-current={mode === tab.value ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === tab.value
                ? "bg-black text-white dark:bg-white dark:text-black"
                : "text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
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
