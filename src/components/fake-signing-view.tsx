"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FakeSigning } from "@/lib/dokobit/fake";
import { DocumentPreviewPane } from "@/components/document-preview-pane";
import { buttonClasses } from "@/components/ui/button";
import { orpc, orpcErrorMessage } from "@/lib/orpc";

/**
 * The simulated signing page's body (see `src/app/fake-dokobit/[token]`).
 * Deliberately doesn't wear the app's own chrome — it stands in for a
 * third-party service — and leads with a banner saying it's a local
 * simulation, so it can't be mistaken for a real signature.
 */
export function FakeSigningView({ signing }: { signing: FakeSigning }) {
  const router = useRouter();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signedAt, setSignedAt] = useState<string | null>(signing.signedAt);
  const [isSigning, setIsSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const pdfUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const file = await orpc.fakeDokobit.download({ token: signing.token });
        if (cancelled) return;
        const url = URL.createObjectURL(file);
        pdfUrlRef.current = url;
        setPdfUrl(url);
      } catch (err) {
        if (!cancelled) setLoadError(orpcErrorMessage(err, "Failed to load the document"));
      }
    })();

    return () => {
      cancelled = true;
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    };
  }, [signing.token]);

  async function handleSign() {
    setSignError(null);
    setIsSigning(true);
    try {
      const result = await orpc.fakeDokobit.sign({ token: signing.token });
      setSignedAt(result.signing.signedAt);
      // The signed state is what the server rendered this page from, so keep
      // the two in step for a later reload or back-navigation.
      router.refresh();
    } catch (err) {
      setSignError(orpcErrorMessage(err, "Failed to sign the document"));
    } finally {
      setIsSigning(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-50 dark:bg-black">
      <div className="shrink-0 border-b border-amber-500/30 bg-amber-50 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
        <div className="mx-auto w-full max-w-[var(--content-max)] px-6 py-3">
          <p className="font-medium">Simulated Dokobit signing</p>
          <p className="mt-0.5">
            This page stands in for Dokobit while the app runs locally. No document
            left this machine and no email was sent — signing here is not a real
            signature.
          </p>
        </div>
      </div>

      <div className="shrink-0 border-b border-border">
        <div className="mx-auto flex w-full max-w-[var(--content-max)] flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">
              {signing.signingName}
            </h1>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {signing.filename} · invited{" "}
              <span className="font-medium">
                {signing.signer.name} {signing.signer.surname}
              </span>{" "}
              &lt;{signing.signer.email}&gt;
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1">
            {signedAt ? (
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                Signed{" "}
                {/* The server and the browser are in different locales and
                    time zones, so this one formatted string legitimately
                    differs between them — the machine-readable `dateTime` is
                    what stays stable. */}
                <time dateTime={signedAt} suppressHydrationWarning>
                  {new Date(signedAt).toLocaleString()}
                </time>
              </span>
            ) : (
              <button
                type="button"
                onClick={handleSign}
                disabled={isSigning}
                className={buttonClasses()}
              >
                {isSigning ? "Signing…" : "Sign"}
              </button>
            )}
            {signError && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {signError}
              </p>
            )}
          </div>
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-[var(--content-max)] min-h-0 flex-1 flex-col">
        <DocumentPreviewPane
          url={pdfUrl}
          loading={!pdfUrl && !loadError}
          error={loadError}
          loadingLabel="Loading document…"
          emptyState={
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {loadError ? "Could not load the document" : "Loading document…"}
            </div>
          }
        />
      </main>
    </div>
  );
}
