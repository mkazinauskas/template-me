"use client";

import { useState } from "react";
import type { TemplateField } from "@/db/schema";
import { buttonClasses } from "@/components/ui/button";
import { orpc, orpcErrorMessage } from "@/lib/orpc";
import { blankValues } from "@/components/fill-form/field-grouping";
import { FieldGroups } from "@/components/fill-form/field-groups";

function CheckIcon() {
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="h-7 w-7 text-emerald-600 dark:text-emerald-400"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    </div>
  );
}

/**
 * The form a link recipient sees at `/fill/[code]` — just the template's
 * fields, no document preview. Submitting posts the values and, on success,
 * the link is done: the server has already marked it used, so this takes
 * over the whole screen with a confirmation rather than leaving the (now
 * stale) form header and fields on screen behind it.
 */
export function FillRequestForm({
  code,
  templateName,
  fields,
}: {
  code: string;
  templateName: string;
  fields: TemplateField[];
}) {
  const [values, setValues] = useState<Record<string, string>>(() => blankValues(fields));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await orpc.fillRequests.submit({ code, data: values });
      setSubmitted(true);
    } catch (err) {
      setError(orpcErrorMessage(err, "Failed to submit"));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <CheckIcon />
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight">
            Thanks — your response was submitted
          </h1>
          <p className="text-sm text-muted-foreground">
            {templateName} has been filled in and sent. This link has now been used and
            can&apos;t be opened again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{templateName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fill in the information below. This link can only be used once.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
        <button type="submit" disabled={isSubmitting} className={buttonClasses()}>
          {isSubmitting ? "Submitting…" : "Submit"}
        </button>
      </form>
    </div>
  );
}
