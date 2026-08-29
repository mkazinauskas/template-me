import Link from "next/link";
import { Logo } from "@/components/logo";
import { DocumentExample } from "@/components/document-example";

const steps = [
  {
    title: "Upload a template",
    description:
      "Drop in a .docx file with placeholders like {{field_name}} — fields are detected automatically.",
  },
  {
    title: "Fill in the fields",
    description:
      "Fill one document at a time in a clean web form, or fill hundreds at once from a CSV.",
  },
  {
    title: "Download a PDF",
    description:
      "Get a polished, ready-to-send PDF in seconds — no Word, no manual formatting.",
  },
];

const features = [
  {
    title: "Automatic field detection",
    description: "Placeholders are picked straight out of your Word document — no manual setup.",
  },
  {
    title: "Bulk generation",
    description: "Upload a CSV and generate a batch of filled PDFs in one go.",
  },
  {
    title: "Typed fields",
    description: "Text, numbers, dates, and toggles — fields render as the right input automatically.",
  },
  {
    title: "No installs",
    description: "Runs entirely in the browser. Nothing to install, nothing to configure.",
  },
  {
    title: "Free & open source",
    description:
      "Source is public on GitHub. Clone it and run it on your own machine — no account or subscription required.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black overflow-x-hidden">
      <header className="mx-auto max-w-5xl px-6 py-6 flex items-center justify-between relative z-10">
        <Link href="/" className="transition-transform hover:scale-[1.03]">
          <Logo />
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/templates"
            className="text-sm font-medium text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white"
          >
            Browse templates
          </Link>
          <a
            href="https://github.com/mkazinauskas/template-me"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white"
          >
            GitHub
          </a>
          <Link
            href="/dashboard"
            className="rounded-md bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-sm font-medium hover:opacity-90 hover:scale-[1.03] transition-all"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <main>
        <section className="relative mx-auto max-w-3xl px-6 pt-16 pb-20 text-center flex flex-col items-center gap-6 overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-gradient-to-br from-zinc-300/40 to-zinc-400/10 dark:from-white/10 dark:to-white/0 blur-3xl animate-float"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-10 -right-10 h-56 w-56 rounded-full bg-gradient-to-br from-zinc-300/30 to-transparent dark:from-white/5 blur-3xl animate-float-slow"
          />
          <a
            href="https://github.com/mkazinauskas/template-me"
            target="_blank"
            rel="noopener noreferrer"
            className="animate-fade-in-up inline-flex items-center gap-1.5 rounded-full border border-black/10 dark:border-white/15 bg-white dark:bg-white/[0.04] px-3 py-1 text-xs font-medium text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white hover:scale-[1.03] transition-all"
          >
            100% free &amp; open source — self-host on your own machine
          </a>
          <h1 className="animate-fade-in-up text-4xl sm:text-5xl font-semibold tracking-tight text-balance">
            Turn Word docs into fillable PDF templates
          </h1>
          <p
            className="animate-fade-in-up text-base sm:text-lg text-black/60 dark:text-white/60 max-w-xl text-balance"
            style={{ animationDelay: "0.1s" }}
          >
            Upload a .docx file with {"{{placeholder}}"} tags and Template Me
            turns it into a web form. Fill it in — one document at a time or in
            bulk from a CSV — and download a finished PDF.
          </p>
          <div
            className="animate-fade-in-up flex flex-col sm:flex-row items-center gap-3 mt-2"
            style={{ animationDelay: "0.2s" }}
          >
            <Link
              href="/dashboard"
              className="rounded-md bg-black text-white dark:bg-white dark:text-black px-6 py-3 text-sm font-medium hover:opacity-90 hover:scale-[1.03] transition-all"
            >
              Go to Dashboard
            </Link>
            <a
              href="/example-template.docx"
              download
              className="rounded-md border border-black/15 dark:border-white/20 px-6 py-3 text-sm font-medium hover:bg-black/[0.03] dark:hover:bg-white/[0.06] hover:scale-[1.03] transition-all"
            >
              Download example template
            </a>
          </div>
          <p
            className="animate-fade-in-up text-xs text-black/40 dark:text-white/40"
            style={{ animationDelay: "0.25s" }}
          >
            No account needed to run it locally — clone the repo and it&apos;s
            yours, free forever.
          </p>
        </section>

        <DocumentExample />

        <section className="mx-auto max-w-5xl px-6 pb-20">
          <div className="grid sm:grid-cols-3 gap-4">
            {steps.map((step, i) => (
              <div
                key={step.title}
                className="animate-fade-in-up rounded-xl border border-black/10 dark:border-white/15 p-6 flex flex-col gap-2 bg-white dark:bg-white/[0.02] transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-white/5"
                style={{ animationDelay: `${0.1 * i}s` }}
              >
                <span className="text-xs font-semibold text-black/40 dark:text-white/40">
                  Step {i + 1}
                </span>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="text-sm text-black/60 dark:text-white/60">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 pb-20 text-center flex flex-col items-center">
          <div
            className="animate-fade-in-up w-full max-w-md rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-white/[0.02] p-4 text-left"
            style={{ animationDelay: "0.3s" }}
          >
            <p className="text-xs font-medium text-black/50 dark:text-white/50 mb-2">
              Run it locally with Docker Compose
            </p>
            <pre className="overflow-x-auto rounded-md bg-zinc-900 dark:bg-black px-3 py-2.5 text-xs text-zinc-100 font-mono">
              <code>
                git clone https://github.com/mkazinauskas/template-me.git
                {"\n"}cd template-me
                {"\n"}docker compose up
              </code>
            </pre>
            <p className="mt-2 text-xs text-black/40 dark:text-white/40">
              Then open{" "}
              <span className="font-mono text-black/60 dark:text-white/60">
                localhost:3000
              </span>{" "}
              — no cloud account required.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-24">
          <h2 className="text-xl font-semibold tracking-tight text-center mb-8">
            Everything you need to automate document generation
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {features.map((feature, i) => (
              <div
                key={feature.title}
                className="animate-fade-in-up rounded-xl border border-black/10 dark:border-white/15 p-6 flex flex-col gap-1.5 transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-white/5"
                style={{ animationDelay: `${0.08 * i}s` }}
              >
                <h3 className="font-medium">{feature.title}</h3>
                <p className="text-sm text-black/60 dark:text-white/60">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 pb-24 text-center flex flex-col items-center gap-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            Ready to automate your paperwork?
          </h2>
          <p className="text-sm text-black/60 dark:text-white/60 max-w-md">
            Upload your first template and have a fillable PDF workflow running
            in under a minute.
          </p>
          <Link
            href="/dashboard"
            className="rounded-md bg-black text-white dark:bg-white dark:text-black px-6 py-3 text-sm font-medium hover:opacity-90 hover:scale-[1.03] transition-all"
          >
            Go to Dashboard
          </Link>
        </section>
      </main>
    </div>
  );
}
