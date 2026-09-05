"use client";

import { useEffect, useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/input";
import { orpc, orpcErrorMessage } from "@/lib/orpc";
import { guessSignerName } from "./signer-name";

type Sent = { email: string; signingUrl: string };

/**
 * "Send for signing" control for the fill-in form: reveals a signer panel,
 * then fills the template, renders it to PDF and hands it to Dokobit, which
 * emails the signer their invitation (see `templates.sendForSigning`).
 *
 * Every button here is `type="button"`: this renders *inside* the fill form,
 * whose own submit downloads the document. For the same reason the panel is a
 * plain <div> rather than a nested <form> — Enter is wired up by hand instead.
 */
export function DokobitSignPanel({
  templateId,
  values,
}: {
  templateId: string;
  values: Record<string, string>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  // Names are guessed from the email until the user types one themselves —
  // after that their input wins and is never overwritten.
  const [namesEdited, setNamesEdited] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);

  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) emailRef.current?.focus();
  }, [isOpen]);

  function updateEmail(next: string) {
    setEmail(next);
    if (namesEdited) return;
    const guess = guessSignerName(next);
    setName(guess.name);
    setSurname(guess.surname);
  }

  function close() {
    setIsOpen(false);
    setError(null);
  }

  async function handleSend() {
    setError(null);
    setIsSending(true);
    try {
      const result = await orpc.templates.sendForSigning({
        id: templateId,
        data: values,
        signer: { email: email.trim(), name: name.trim(), surname: surname.trim() },
      });
      setSent({ email: result.email, signingUrl: result.signingUrl });
      setIsOpen(false);
    } catch (err) {
      setError(orpcErrorMessage(err, "Failed to send the document for signing"));
    } finally {
      setIsSending(false);
    }
  }

  const canSend =
    email.trim() !== "" && name.trim() !== "" && surname.trim() !== "" && !isSending;

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    // The surrounding fill form would otherwise treat Enter as "download".
    e.preventDefault();
    if (canSend) void handleSend();
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => (isOpen ? close() : setIsOpen(true))}
        aria-expanded={isOpen}
        aria-controls="dokobit-signer-panel"
        className={buttonClasses({ variant: "secondary" })}
      >
        Sign with Dokobit
      </button>

      {isOpen && (
        <div
          id="dokobit-signer-panel"
          className="flex flex-col gap-3 rounded-md border border-border p-4"
        >
          <div>
            <p className="text-sm font-medium">Send for signing</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              The filled document is uploaded to Dokobit, which emails the signer an
              invitation to sign it.
            </p>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Signer email</span>
            <input
              ref={emailRef}
              type="email"
              value={email}
              required
              autoComplete="email"
              placeholder="jonas.petraitis@example.lt"
              onChange={(e) => updateEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              className={inputClasses}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Signer first name</span>
              <input
                type="text"
                value={name}
                required
                onChange={(e) => {
                  setNamesEdited(true);
                  setName(e.target.value);
                }}
                onKeyDown={handleKeyDown}
                className={inputClasses}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Signer last name</span>
              <input
                type="text"
                value={surname}
                required
                onChange={(e) => {
                  setNamesEdited(true);
                  setSurname(e.target.value);
                }}
                onKeyDown={handleKeyDown}
                className={inputClasses}
              />
            </label>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className={buttonClasses()}
            >
              {isSending ? "Sending…" : "Send for signing"}
            </button>
            <button
              type="button"
              onClick={close}
              className={buttonClasses({ variant: "secondary" })}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {sent && !isOpen && (
        <p role="status" className="text-sm text-muted-foreground">
          Sent to <span className="font-medium text-foreground">{sent.email}</span> for
          signing.{" "}
          <a
            href={sent.signingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            Open the signing page
          </a>
        </p>
      )}
    </div>
  );
}
