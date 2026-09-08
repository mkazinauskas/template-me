"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { FillRequest, TemplateField } from "@/db/schema";
import { buttonClasses } from "@/components/ui/button";
import { downloadBlob } from "@/lib/download";
import { slugifyFilename } from "@/lib/slugify";
import { orpc, orpcErrorMessage } from "@/lib/orpc";
import { blankValues } from "@/components/fill-form/field-grouping";
import { FieldGroups } from "@/components/fill-form/field-groups";
import { useLivePreview } from "@/components/fill-form/use-live-preview";
import {
  NewFillLinkDialog,
  type FillLinkDraft,
} from "@/components/fill-form/new-fill-link-dialog";
import { DocumentPreviewPane } from "@/components/document-preview-pane";
import {
  useResizablePaneWidth,
  useResizablePaneHeight,
  ResizeHandle,
  VerticalResizeHandle,
} from "@/hooks/use-resizable-pane";

type FillRequestsPanelProps = {
  templateId: string;
  templateName: string;
  fields: TemplateField[];
};

function statusOf(request: FillRequest): "pending" | "filled" | "revoked" {
  if (request.filledAt) return "filled";
  if (request.revokedAt) return "revoked";
  return "pending";
}

function formatDate(value: Date | string) {
  return new Date(value).toLocaleString();
}

function fillLinkPath(code: string) {
  return `/fill/${code}`;
}

/** Copies a link to the clipboard and flashes "Copied" on the trigger button for a moment. */
function useCopyLink() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copy = useCallback(async (id: string, path: string) => {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
    } catch {
      // Clipboard access can fail (permissions, insecure context) — the link
      // text is still visible on the row for the owner to select manually.
    }
  }, []);

  return { copiedId, copy };
}

/**
 * A destructive action that confirms in place: the trigger swaps itself for a
 * "Confirm / Cancel" pair, which collapses again once the action settles, is
 * cancelled, or loses focus. Owns both the confirming and in-flight state so
 * every row doesn't have to carry its own copy — `onConfirm` just does the
 * work and may throw, leaving the row free to render the error however it
 * wants.
 */
function InlineConfirm({
  label,
  pendingLabel,
  onConfirm,
}: {
  label: string;
  pendingLabel: string;
  onConfirm: () => Promise<void>;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPending, setIsPending] = useState(false);

  async function handleConfirm() {
    setIsPending(true);
    try {
      await onConfirm();
    } finally {
      setIsPending(false);
      setIsConfirming(false);
    }
  }

  if (!isConfirming) {
    return (
      <button
        type="button"
        onClick={() => setIsConfirming(true)}
        className="text-sm text-red-600 dark:text-red-400 hover:underline"
      >
        {label}
      </button>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-2 text-sm"
      onBlur={(e) => {
        if (!isPending && !e.currentTarget.contains(e.relatedTarget)) setIsConfirming(false);
      }}
    >
      <button
        type="button"
        autoFocus
        onClick={handleConfirm}
        disabled={isPending}
        className="text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
      >
        {isPending ? pendingLabel : "Confirm"}
      </button>
      <button
        type="button"
        onClick={() => setIsConfirming(false)}
        disabled={isPending}
        className="text-muted-foreground hover:underline disabled:opacity-50"
      >
        Cancel
      </button>
    </span>
  );
}

function SubmittedData({ fields, data }: { fields: TemplateField[]; data: Record<string, string> }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
      {fields.map((field) => (
        <div key={field.key} className="contents">
          <dt className="text-muted-foreground">{field.label}</dt>
          <dd className="break-words">{data[field.key] || <span className="text-muted-foreground">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The edit UI for an already-filled link: fields on the left, a live
 * rendered-document preview on the right, same idea as the single-fill form.
 * A separate component (not just a branch inside `FilledRow`) so the live
 * preview's requests only start while this is actually mounted, instead of
 * firing for every submitted row as soon as the panel loads.
 */
function EditFilledData({
  templateId,
  fields,
  initialData,
  onSave,
  onCancel,
}: {
  templateId: string;
  fields: TemplateField[];
  initialData: Record<string, string>;
  onSave: (data: Record<string, string>) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...blankValues(fields),
    ...initialData,
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { previewUrl, isPreviewLoading, previewError } = useLivePreview(templateId, values);
  const { width: fieldsWidth, containerRef, startResizing, resetWidth } =
    useResizablePaneWidth({
      storageKey: "fillRequestEditPaneWidth",
      min: 240,
      max: 640,
      defaultWidth: 288,
    });
  const {
    height: paneHeight,
    containerRef: heightContainerRef,
    startResizing: startResizingHeight,
    resetHeight,
  } = useResizablePaneHeight({
    storageKey: "fillRequestEditPaneHeight",
    min: 240,
    max: 1200,
    defaultHeight: 448,
  });

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      await onSave(values);
    } catch (err) {
      setError(orpcErrorMessage(err, "Failed to save changes"));
      setIsSaving(false);
    }
  }

  return (
    <div ref={heightContainerRef}>
      <div
        ref={containerRef}
        style={{ height: `${paneHeight}px` }}
        className="flex flex-col gap-4 overflow-hidden lg:flex-row lg:gap-0"
      >
        <div
          style={{ "--fields-width": `${fieldsWidth}px` } as CSSProperties}
          className="flex flex-col gap-4 overflow-y-auto py-1 lg:w-[var(--fields-width)] lg:shrink-0 lg:pr-4"
        >
          <FieldGroups
            fields={fields}
            values={values}
            onFieldChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
          />
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={buttonClasses({ size: "sm" })}
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="text-sm text-muted-foreground hover:underline disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>

        <ResizeHandle onPointerDown={startResizing} onReset={resetWidth} />

        <DocumentPreviewPane
          url={previewUrl}
          loading={isPreviewLoading}
          error={previewError}
          loadingLabel="Updating preview…"
          emptyState={
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {isPreviewLoading ? "Rendering preview…" : "Preview will appear here"}
            </div>
          }
        />
      </div>

      <VerticalResizeHandle onPointerDown={startResizingHeight} onReset={resetHeight} />
    </div>
  );
}

function FilledRow({
  request,
  templateId,
  templateName,
  fields,
  onUpdated,
  onDeleted,
}: {
  request: FillRequest;
  templateId: string;
  templateName: string;
  fields: TemplateField[];
  onUpdated: (request: FillRequest) => void;
  onDeleted: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload(format: "pdf" | "docx") {
    setDownloading(format);
    setError(null);
    try {
      const file = await orpc.templates.generate({
        id: templateId,
        data: request.data ?? {},
        format,
      });
      downloadBlob(file, `${slugifyFilename(templateName)}.${format}`);
    } catch (err) {
      setError(orpcErrorMessage(err, "Failed to generate document"));
    } finally {
      setDownloading(null);
    }
  }

  function startEditing() {
    setIsEditing(true);
    setExpanded(true);
    setError(null);
  }

  async function handleSaveEdit(data: Record<string, string>) {
    const { fillRequest } = await orpc.fillRequests.updateData({ id: request.id, data });
    onUpdated(fillRequest);
    setIsEditing(false);
  }

  async function handleDelete() {
    try {
      await orpc.fillRequests.delete({ id: request.id });
      onDeleted(request.id);
    } catch (err) {
      setError(orpcErrorMessage(err, "Failed to delete"));
    }
  }

  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-medium text-emerald-700 dark:text-emerald-400">Filled</span>{" "}
          <span className="text-muted-foreground">{formatDate(request.filledAt!)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-sm text-muted-foreground hover:underline"
          >
            {expanded ? "Hide data" : "View data"}
          </button>
          <button
            type="button"
            onClick={() => handleDownload("pdf")}
            disabled={downloading !== null}
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            {downloading === "pdf" ? "…" : "PDF"}
          </button>
          <button
            type="button"
            onClick={() => handleDownload("docx")}
            disabled={downloading !== null}
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            {downloading === "docx" ? "…" : "Word"}
          </button>
          <InlineConfirm label="Delete" pendingLabel="Deleting…" onConfirm={handleDelete} />
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {expanded && (
        <div className="mt-3 border-t border-border pt-3">
          {isEditing ? (
            <EditFilledData
              templateId={templateId}
              fields={fields}
              initialData={request.data ?? {}}
              onSave={handleSaveEdit}
              onCancel={() => setIsEditing(false)}
            />
          ) : (
            <>
              <SubmittedData fields={fields} data={request.data ?? {}} />
              <button
                type="button"
                onClick={startEditing}
                className="mt-2 text-sm text-muted-foreground hover:underline"
              >
                Edit
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function RevokedRow({
  request,
  onDeleted,
}: {
  request: FillRequest;
  onDeleted: (id: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    try {
      await orpc.fillRequests.delete({ id: request.id });
      onDeleted(request.id);
    } catch (err) {
      setError(orpcErrorMessage(err, "Failed to delete"));
    }
  }

  return (
    <li className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>Revoked {formatDate(request.revokedAt!)}</span>
        <InlineConfirm label="Delete" pendingLabel="Deleting…" onConfirm={handleDelete} />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </li>
  );
}

function PendingRow({
  request,
  fieldCount,
  onRevoked,
}: {
  request: FillRequest;
  /** How many fields the template has, for the "3 of 8 questions" summary. */
  fieldCount: number;
  onRevoked: (id: string) => void;
}) {
  const { copiedId, copy } = useCopyLink();
  const path = fillLinkPath(request.code);
  const asked = request.fieldKeys?.length ?? fieldCount;

  async function handleRevoke() {
    await orpc.fillRequests.revoke({ id: request.id });
    onRevoked(request.id);
  }

  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-sm font-medium">{request.title || "Pending"}</span>{" "}
          <span className="text-muted-foreground text-sm">{formatDate(request.createdAt)}</span>
          <p className="text-xs text-muted-foreground">
            Asks for {asked === fieldCount ? "all" : asked} of {fieldCount}{" "}
            {fieldCount === 1 ? "question" : "questions"}
          </p>
          <code className="mt-1 block truncate text-xs text-muted-foreground">{path}</code>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => copy(request.id, path)}
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            {copiedId === request.id ? "Copied!" : "Copy link"}
          </button>
          <InlineConfirm label="Revoke" pendingLabel="Revoking…" onConfirm={handleRevoke} />
        </div>
      </div>
    </li>
  );
}

/**
 * Owner-only tab: generate one-time links that let anyone with the URL fill
 * in the template's fields — without ever seeing the document itself — and
 * download the result. "New link" opens a dialog to pick which fields that
 * particular link asks for and to write a title and note for whoever opens
 * it. Each link is good for exactly one submission: once filled, the server
 * marks it done and any further open/submit is rejected, same as if it had
 * been revoked here.
 */
export function FillRequestsPanel({ templateId, templateName, fields }: FillRequestsPanelProps) {
  const [requests, setRequests] = useState<FillRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isPicking, setIsPicking] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { fillRequests } = await orpc.fillRequests.list({ templateId });
      setRequests(fillRequests);
    } catch (err) {
      setError(orpcErrorMessage(err, "Failed to load fill links"));
    }
  }, [templateId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  async function handleCreate(draft: FillLinkDraft) {
    setIsCreating(true);
    setError(null);
    try {
      await orpc.fillRequests.create({ templateId, ...draft });
      setIsPicking(false);
      await refresh();
    } catch (err) {
      setError(orpcErrorMessage(err, "Failed to create a fill link"));
    } finally {
      setIsCreating(false);
    }
  }

  function handleRevoked(id: string) {
    setRequests((current) =>
      current?.map((r) => (r.id === id ? { ...r, revokedAt: new Date() } : r)) ?? current
    );
  }

  function handleDataUpdated(updated: FillRequest) {
    setRequests((current) => current?.map((r) => (r.id === updated.id ? updated : r)) ?? current);
  }

  function handleDeleted(id: string) {
    setRequests((current) => current?.filter((r) => r.id !== id) ?? current);
  }

  const pending = requests?.filter((r) => statusOf(r) === "pending") ?? [];
  const filled = requests?.filter((r) => statusOf(r) === "filled") ?? [];
  const revoked = requests?.filter((r) => statusOf(r) === "revoked") ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Generate a link anyone can open to fill in this template&apos;s data — no sign-in, no
          document preview. Each link works once; it&apos;s marked used the moment it&apos;s
          submitted.
        </p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setIsPicking(true);
          }}
          className={buttonClasses({ className: "shrink-0" })}
        >
          New link
        </button>
      </div>

      {isPicking && (
        <NewFillLinkDialog
          fields={fields}
          isCreating={isCreating}
          error={error}
          onCancel={() => setIsPicking(false)}
          onCreate={handleCreate}
        />
      )}

      {error && !isPicking && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {requests === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No links yet — create one to get started.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {pending.length > 0 && (
            <ul className="flex flex-col gap-2">
              {pending.map((r) => (
                <PendingRow
                  key={r.id}
                  request={r}
                  fieldCount={fields.length}
                  onRevoked={handleRevoked}
                />
              ))}
            </ul>
          )}
          {filled.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold">Submitted</h2>
              <ul className="flex flex-col gap-2">
                {filled.map((r) => (
                  <FilledRow
                    key={r.id}
                    request={r}
                    templateId={templateId}
                    templateName={templateName}
                    fields={fields}
                    onUpdated={handleDataUpdated}
                    onDeleted={handleDeleted}
                  />
                ))}
              </ul>
            </div>
          )}
          {revoked.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Revoked</h2>
              <ul className="flex flex-col gap-2">
                {revoked.map((r) => (
                  <RevokedRow key={r.id} request={r} onDeleted={handleDeleted} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
