"use client";

/** The shared card shell for both auth forms: a bordered `<form>` with a heading and subtitle. */
export function AuthCard({
  mode,
  subtitle,
  error,
  onSubmit,
  children,
}: {
  mode: "sign-in" | "sign-up";
  subtitle: React.ReactNode;
  /** Only used to wire `aria-describedby`; render {@link FormError} yourself where it belongs. */
  error: string | null;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <form
      onSubmit={onSubmit}
      aria-describedby={error ? "form-error" : undefined}
      className="rounded-xl border border-border p-6 flex flex-col gap-4 w-full max-w-sm"
    >
      <div>
        <h1 className="text-lg font-semibold">
          {mode === "sign-up" ? "Create an account" : "Sign in"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      </div>

      {children}
    </form>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p id="form-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}
