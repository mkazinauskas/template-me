import Link from "next/link";
import { headers } from "next/headers";
import { Logo } from "@/components/logo";
import { DocumentExample } from "@/components/document-example";
import { DockerRunTabs } from "@/components/docker-run-tabs";
import { auth } from "@/lib/auth";
import { siteUrl } from "@/lib/site-url";
import { buttonClasses } from "@/components/ui/button";

export const dynamic = "force-dynamic";

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

const faqs = [
  {
    question: "What files does Template Me work with?",
    answer:
      "You upload Microsoft Word .docx files that contain {{placeholder}} tags. Each finished document comes back as a PDF, and bulk runs are packaged as a .zip.",
  },
  {
    question: "How do placeholders work?",
    answer:
      "Write tags like {{client_name}} directly in your Word document. Template Me scans the file on upload and builds a form field for every tag, including typed inputs for dates, numbers, dropdowns and yes/no toggles.",
  },
  {
    question: "Can I generate many documents at once?",
    answer:
      "Yes. Upload a CSV where each row is one document and each column maps to a placeholder, and Template Me generates a filled PDF for every row in a single batch.",
  },
  {
    question: "Is Template Me really free?",
    answer:
      "Yes. Template Me is free and open source. You can self-host it with Docker Compose in about a minute, and no account is required to run it locally.",
  },
  {
    question: "Do I need to install Microsoft Word?",
    answer:
      "No. The hosted app runs entirely in your browser. To self-host you only need Docker — there is nothing else to install.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "Template Me",
      url: siteUrl,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "Upload a .docx file with {{placeholder}} tags and Template Me turns it into a web form. Fill it in — one document at a time or in bulk from a CSV — and download a finished PDF.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      isAccessibleForFree: true,
      license: "https://github.com/mkazinauskas/template-me",
      sameAs: ["https://github.com/mkazinauskas/template-me"],
    },
    {
      "@type": "FAQPage",
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    },
  ],
};

export default async function LandingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const ctaHref = session ? "/client/dashboard" : "/sign-in";
  const ctaLabel = session ? "Go to Dashboard" : "Get started free";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black overflow-x-clip">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="sticky top-0 z-30 border-b border-border bg-zinc-50/80 dark:bg-black/80 backdrop-blur-md">
        <div className="mx-auto max-w-[var(--content-max)] px-6 h-14 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="transition-transform hover:scale-[1.03]"
            aria-label="Template Me home"
          >
            <Logo />
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/public/templates"
              className="hidden sm:inline-flex rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
            >
              Browse templates
            </Link>
            <a
              href="https://github.com/mkazinauskas/template-me"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View source on GitHub"
              className="inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.05-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.31-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.29-1.23 3.29-1.23.66 1.65.25 2.87.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.49 5.93.43.37.82 1.1.82 2.22 0 1.61-.02 2.9-.02 3.29 0 .32.22.7.83.58A12 12 0 0 0 24 12.5C24 5.87 18.63.5 12 .5Z" />
              </svg>
            </a>
            <Link
              href={session ? "/client/dashboard" : "/sign-in"}
              className={buttonClasses({ interactive: "hover" })}
            >
              {session ? "Dashboard" : "Login"}
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section
          aria-labelledby="hero-heading"
          className="relative mx-auto max-w-[var(--content-max)] px-6 pt-16 pb-20 text-center flex flex-col items-center gap-6 overflow-hidden"
        >
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
            className="animate-fade-in-up inline-flex items-center gap-1.5 rounded-full border border-border bg-white dark:bg-white/[0.04] px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:scale-[1.03] transition-all"
          >
            100% free &amp; open source — self-host on your own machine
          </a>
          <h1
            id="hero-heading"
            className="animate-fade-in-up text-4xl sm:text-5xl font-semibold tracking-tight text-balance"
          >
            Turn Word docs into{" "}
            <span className="bg-gradient-to-r from-black to-zinc-500 dark:from-white dark:to-zinc-400 bg-clip-text text-transparent">
              fillable PDF templates
            </span>
          </h1>
          <p
            className="animate-fade-in-up text-base sm:text-lg text-muted-foreground max-w-2xl text-pretty"
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
              href={ctaHref}
              className={buttonClasses({ size: "lg", interactive: "hover" })}
            >
              {ctaLabel}
            </Link>
            <a
              href="/example-template.docx"
              download
              className={buttonClasses({ variant: "secondary", size: "lg", interactive: "hover" })}
            >
              Download example template
            </a>
          </div>
          <ul
            className="animate-fade-in-up flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground-subtle"
            style={{ animationDelay: "0.25s" }}
          >
            <li>No sign-up to self-host</li>
            <li aria-hidden="true">·</li>
            <li>Bulk-fill from CSV</li>
            <li aria-hidden="true">·</li>
            <li>Runs fully in your browser</li>
          </ul>
        </section>

        <DocumentExample />

        <section aria-label="How it works" className="mx-auto max-w-[var(--content-max)] px-6 pb-20">
          <div className="grid sm:grid-cols-3 gap-4">
            {steps.map((step, i) => (
              <div
                key={step.title}
                className="animate-fade-in-up rounded-xl border border-border p-6 flex flex-col gap-2 bg-white dark:bg-white/[0.02] transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-white/5"
                style={{ animationDelay: `${0.1 * i}s` }}
              >
                <span className="text-xs font-semibold text-muted-foreground-subtle">
                  Step {i + 1}
                </span>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-[var(--content-max)] px-6 pb-20 flex flex-col items-center">
          <DockerRunTabs />
        </section>

        <section aria-labelledby="features-heading" className="mx-auto max-w-[var(--content-max)] px-6 pb-24">
          <h2
            id="features-heading"
            className="text-xl font-semibold tracking-tight text-center mb-8"
          >
            Everything you need to automate document generation
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {features.map((feature, i) => (
              <div
                key={feature.title}
                className="animate-fade-in-up rounded-xl border border-border p-6 flex flex-col gap-1.5 transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-white/5"
                style={{ animationDelay: `${0.08 * i}s` }}
              >
                <h3 className="font-medium">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="faq-heading" className="mx-auto max-w-[var(--content-max)] px-6 pb-24">
          <h2
            id="faq-heading"
            className="text-xl font-semibold tracking-tight text-center mb-8"
          >
            Frequently asked questions
          </h2>
          <div className="flex flex-col gap-3">
            {faqs.map((faq, i) => (
              <details
                key={faq.question}
                className="animate-fade-in-up group rounded-xl border border-border bg-white dark:bg-white/[0.02] p-5"
                style={{ animationDelay: `${0.06 * i}s` }}
              >
                <summary className="flex cursor-pointer items-center justify-between gap-4 font-medium marker:content-none">
                  {faq.question}
                  <span
                    aria-hidden="true"
                    className="text-muted-foreground-subtle transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="cta-heading"
          className="mx-auto max-w-3xl px-6 pb-24 text-center flex flex-col items-center gap-4"
        >
          <h2 id="cta-heading" className="text-2xl font-semibold tracking-tight">
            Ready to automate your paperwork?
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Upload your first template and have a fillable PDF workflow running
            in under a minute.
          </p>
          <Link
            href={ctaHref}
            className={buttonClasses({ size: "lg", interactive: "hover" })}
          >
            {ctaLabel}
          </Link>
        </section>
      </main>
    </div>
  );
}
