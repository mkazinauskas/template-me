"use client";

import { useEffect, useState } from "react";

type Field = { tag: string; value: string };

const FIELDS: Field[] = [
  { tag: "{{client_name}}", value: "Horizon Studio" },
  { tag: '{{start_date|date("yyyy-mm-dd")}}', value: "2026-09-01" },
  { tag: "{{monthly_rate|number(2)}}", value: "$1,250.00" },
  { tag: '{{auto_renew|boolean("Yes","No")}}', value: "Yes" },
];

type Segment = { text: string } | { field: number };

const SEGMENTS: Segment[] = [
  { text: "This Service Agreement is made between " },
  { field: 0 },
  { text: ", effective " },
  { field: 1 },
  { text: ". The monthly rate is " },
  { field: 2 },
  { text: ", auto-renewing: " },
  { field: 3 },
  { text: "." },
];

const STEP_MS = 1900;
const PAUSE_MS = 2600;

export function DocumentExample() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const delay = activeIndex >= FIELDS.length ? PAUSE_MS : STEP_MS;
    const timer = setTimeout(() => {
      setActiveIndex((i) => (i >= FIELDS.length ? 0 : i + 1));
    }, delay);
    return () => clearTimeout(timer);
  }, [activeIndex, reducedMotion]);

  const effectiveIndex = reducedMotion ? FIELDS.length : activeIndex;
  const done = effectiveIndex >= FIELDS.length;

  return (
    <section className="mx-auto max-w-5xl px-6 pb-24">
      <h2 className="animate-fade-in-up text-xl font-semibold tracking-tight text-center mb-2">
        Watch a template fill itself in
      </h2>
      <p className="animate-fade-in-up text-sm text-black/60 dark:text-white/60 text-center mb-8">
        The same document, before and after — placeholders on the left become
        real values on the right.
      </p>

      <div className="grid sm:grid-cols-2 gap-5 items-stretch relative">
        <div
          aria-hidden="true"
          className="hidden sm:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 h-9 w-9 items-center justify-center rounded-full border border-black/10 dark:border-white/15 bg-zinc-50 dark:bg-black text-black/40 dark:text-white/40"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
            <path
              fillRule="evenodd"
              d="M3 10a.75.75 0 01.75-.75h10.638L11.29 6.16a.75.75 0 111.02-1.1l4.5 4.25a.75.75 0 010 1.1l-4.5 4.25a.75.75 0 11-1.02-1.1l3.098-2.91H3.75A.75.75 0 013 10z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        <DocCard label="template.docx" status="Static source" tone="neutral">
          {SEGMENTS.map((seg, i) =>
            "text" in seg ? (
              <span key={i}>{seg.text}</span>
            ) : (
              <span
                key={i}
                className={`inline-block mx-0.5 rounded px-1.5 py-0.5 font-mono text-xs align-baseline transition-all duration-300 ${
                  seg.field === effectiveIndex
                    ? "bg-amber-200/70 dark:bg-amber-400/25 ring-1 ring-amber-400/60 scale-105"
                    : seg.field < effectiveIndex
                      ? "bg-black/5 dark:bg-white/10 opacity-50"
                      : "bg-black/5 dark:bg-white/10"
                }`}
              >
                {FIELDS[seg.field].tag}
              </span>
            )
          )}
        </DocCard>

        <DocCard
          label="output.pdf"
          status={done ? "Ready to download" : "Generating…"}
          tone={done ? "success" : "active"}
        >
          {SEGMENTS.map((seg, i) =>
            "text" in seg ? (
              <span key={i}>{seg.text}</span>
            ) : seg.field < effectiveIndex ? (
              <span
                key={i}
                className="font-medium text-black dark:text-white"
              >
                {FIELDS[seg.field].value}
              </span>
            ) : seg.field === effectiveIndex ? (
              <span key={`${i}-${activeIndex}`} className="relative inline-flex items-baseline">
                <span className="animate-reveal-wipe font-medium text-black dark:text-white inline-block">
                  {FIELDS[seg.field].value}
                </span>
                <span
                  aria-hidden="true"
                  className="animate-caret ml-0.5 inline-block h-3.5 w-[2px] bg-black/60 dark:bg-white/60 translate-y-0.5"
                />
              </span>
            ) : (
              <span
                key={i}
                className="inline-block mx-0.5 rounded px-1.5 py-0.5 font-mono text-xs align-baseline border border-dashed border-black/15 dark:border-white/20 text-black/25 dark:text-white/25"
              >
                {FIELDS[seg.field].tag}
              </span>
            )
          )}
        </DocCard>
      </div>
    </section>
  );
}

function DocCard({
  label,
  status,
  tone,
  children,
}: {
  label: string;
  status: string;
  tone: "neutral" | "active" | "success";
  children: React.ReactNode;
}) {
  return (
    <div className="animate-fade-in-up rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-white/[0.02] overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-black/10 dark:border-white/15 bg-black/[0.02] dark:bg-white/[0.03]">
        <div className="flex items-center gap-2">
          <span className="flex gap-1">
            <span className="size-2 rounded-full bg-black/15 dark:bg-white/20" />
            <span className="size-2 rounded-full bg-black/15 dark:bg-white/20" />
            <span className="size-2 rounded-full bg-black/15 dark:bg-white/20" />
          </span>
          <span className="text-xs font-mono text-black/50 dark:text-white/50">
            {label}
          </span>
        </div>
        <span
          className={`text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors duration-300 ${
            tone === "success"
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : tone === "active"
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                : "bg-black/5 dark:bg-white/10 text-black/50 dark:text-white/50"
          }`}
        >
          {status}
        </span>
      </div>
      <div className="p-5 sm:p-6 text-sm leading-relaxed text-black/80 dark:text-white/80 flex-1">
        {children}
      </div>
    </div>
  );
}
