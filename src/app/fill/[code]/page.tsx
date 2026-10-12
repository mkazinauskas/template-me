import Link from "next/link";
import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { Logo } from "@/components/logo";
import { getFillRequestStatus } from "@/components/fill-request-detail";
import { FillRequestForm } from "@/components/fill-request-form";
import { themeStyle } from "@/lib/fill-link-theme";

export const metadata: Metadata = {
  title: "Fill in requested information",
  robots: { index: false, follow: false },
};

export default async function FillLinkPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const result = await getFillRequestStatus(code);
  const theme = result.status === "ok" ? result.theme : null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black flex flex-col">
      <AppHeader />
      <main
        // The owner's colors re-skin only the page body; the header stays the
        // app's so the recipient still knows where they are.
        data-fill-theme={theme ? "" : undefined}
        style={theme ? themeStyle(theme) : undefined}
        className="flex flex-1 items-center justify-center px-6 py-10"
      >
        {result.status === "ok" ? (
          <FillRequestForm
            code={code}
            templateName={result.templateName}
            fields={result.fields}
            title={result.title}
            message={result.message}
            themed={theme !== null}
          />
        ) : (
          <div className="flex flex-col items-center gap-6 text-center max-w-md">
            <Link href="/" className="transition-transform hover:scale-[1.03]">
              <Logo />
            </Link>
            <div className="flex flex-col gap-2">
              <h1 className="text-xl font-semibold tracking-tight">
                {result.status === "used" ? "This link has already been used" : "Link not found"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {result.status === "used"
                  ? "This one-time link has already been filled in or revoked."
                  : "This link doesn't exist. Double-check the URL you were given."}
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
