"use client";

import { useCallback, useEffect, useState } from "react";
import type { FillRequest, TemplateField } from "@/db/schema";
import { buttonClasses } from "@/components/ui/button";
import { downloadBlob } from "@/lib/download";
import { slugifyFilename } from "@/lib/slugify";
import { orpc, orpcErrorMessage } from "@/lib/orpc";
import { blankValues } from "@/components/fill-form/field-grouping";
import { FieldGroups } from "@/components/fill-form/field-groups";
import { useLivePreview } from "@/components/fill-form/use-live-preview";
import { DocumentPreviewPane } from "@/components/document-preview-pane";

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
    <div className="flex h-[28rem] flex-col gap-4 lg:flex-row">
      <div className="flex flex-col gap-4 overflow-y-auto lg:w-72 lg:shrink-0">
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
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
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
    setIsDeleting(true);
    try {
      await orpc.fillRequests.delete({ id: request.id });
      onDeleted(request.id);
    } catch (err) {
      setError(orpcErrorMessage(err, "Failed to delete"));
      setIsDeleting(false);
      setIsConfirmingDelete(false);
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
          {isConfirmingDelete ? (
            <span
              className="inline-flex items-center gap-2 text-sm"
              onBlur={(e) => {
                if (!isDeleting && !e.currentTarget.contains(e.relatedTarget)) {
                  setIsConfirmingDelete(false);
                }
              }}
            >
              <button
                type="button"
                autoFocus
                onClick={handleDelete}
                disabled={isDeleting}
                className="text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
              >
                {isDeleting ? "Deleting…" : "Confirm"}
              </button>
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(false)}
                disabled={isDeleting}
                className="text-muted-foreground hover:underline disabled:opacity-50"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setIsConfirmingDelete(true)}
              className="text-sm text-red-600 dark:text-red-400 hover:underline"
            >
              Delete
            </button>
          )}
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
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await orpc.fillRequests.delete({ id: request.id });
      onDeleted(request.id);
    } catch (err) {
      setError(orpcErrorMessage(err, "Failed to delete"));
      setIsDeleting(false);
      setIsConfirming(false);
    }
  }

  return (
    <li className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>Revoked {formatDate(request.revokedAt!)}</span>
        {isConfirming ? (
          <span
            className="inline-flex items-center gap-2"
            onBlur={(e) => {
              if (!isDeleting && !e.currentTarget.contains(e.relatedTarget)) setIsConfirming(false);
            }}
          >
            <button
              type="button"
              autoFocus
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
            >
              {isDeleting ? "Deleting…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => setIsConfirming(false)}
              disabled={isDeleting}
              className="text-muted-foreground hover:underline disabled:opacity-50"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setIsConfirming(true)}
            className="text-red-600 dark:text-red-400 hover:underline"
          >
            Delete
          </button>
        )}
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
  onRevoked,
}: {
  request: FillRequest;
  onRevoked: (id: string) => void;
}) {
  const { copiedId, copy } = useCopyLink();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const path = fillLinkPath(request.code);

  async function handleRevoke() {
    setIsRevoking(true);
    try {
      await orpc.fillRequests.revoke({ id: request.id });
      onRevoked(request.id);
    } finally {
      setIsRevoking(false);
      setIsConfirming(false);
    }
  }

  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-sm font-medium">Pending</span>{" "}
          <span className="text-muted-foreground text-sm">{formatDate(request.createdAt)}</span>
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
          {isConfirming ? (
            <span
              className="inline-flex items-center gap-2 text-sm"
              onBlur={(e) => {
                if (!isRevoking && !e.currentTarget.contains(e.relatedTarget)) setIsConfirming(false);
              }}
            >
              <button
                type="button"
                autoFocus
                onClick={handleRevoke}
                disabled={isRevoking}
                className="text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
              >
                {isRevoking ? "Revoking…" : "Confirm"}
              </button>
              <button
                type="button"
                onClick={() => setIsConfirming(false)}
                disabled={isRevoking}
                className="text-muted-foreground hover:underline disabled:opacity-50"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setIsConfirming(true)}
              className="text-sm text-red-600 dark:text-red-400 hover:underline"
            >
              Revoke
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Owner-only tab: generate one-time links that let anyone with the URL fill
 * in the template's fields — without ever seeing the document itself — and
 * download the result. Each link is good for exactly one submission: once
 * filled, the server marks it done and any further open/submit is rejected,
 * same as if it had been revoked here.
 */
export function FillRequestsPanel({ templateId, templateName, fields }: FillRequestsPanelProps) {
  const [requests, setRequests] = useState<FillRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

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

  async function handleCreate() {
    setIsCreating(true);
    setError(null);
    try {
      await orpc.fillRequests.create({ templateId });
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
          onClick={handleCreate}
          disabled={isCreating}
          className={buttonClasses({ className: "shrink-0" })}
        >
          {isCreating ? "Creating…" : "New link"}
        </button>
      </div>

      {error && (
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
                <PendingRow key={r.id} request={r} onRevoked={handleRevoked} />
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
