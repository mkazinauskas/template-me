"use client";

import { useId, useRef, useState } from "react";

const COMPOSE_URL =
  "https://raw.githubusercontent.com/mkazinauskas/template-me/main/docker-compose.prebuilt.yml";
const UP_CMD = "docker compose -f docker-compose.prebuilt.yml up";

type Step = { text: string; code?: string };

type Platform = {
  id: string;
  label: string;
  steps: Step[];
};

const PLATFORMS: Platform[] = [
  {
    id: "linux",
    label: "Linux",
    steps: [
      {
        text: "Install Rancher Desktop (.deb, .rpm or AppImage) from rancherdesktop.io and launch it.",
      },
      {
        text: 'In Rancher Desktop → Preferences → Container Engine, pick "dockerd (moby)" so the docker CLI is available.',
      },
      { text: "Download the Compose file:", code: `wget ${COMPOSE_URL}` },
      { text: "Start the stack:", code: UP_CMD },
    ],
  },
  {
    id: "macos",
    label: "macOS",
    steps: [
      {
        text: "Install and start Rancher Desktop:",
        code: "brew install --cask rancher\nopen -a 'Rancher Desktop'",
      },
      {
        text: 'In Rancher Desktop → Preferences → Container Engine, pick "dockerd (moby)" so the docker CLI is available.',
      },
      { text: "Download the Compose file:", code: `curl -O ${COMPOSE_URL}` },
      { text: "Start the stack:", code: UP_CMD },
    ],
  },
  {
    id: "windows",
    label: "Windows",
    steps: [
      {
        text: "Install Rancher Desktop from PowerShell, then launch it from the Start menu:",
        code: "winget install suse.RancherDesktop",
      },
      {
        text: 'In Rancher Desktop → Preferences → Container Engine, pick "dockerd (moby)" so the docker CLI is available.',
      },
      {
        text: "Download the Compose file (PowerShell):",
        code: `curl.exe -O ${COMPOSE_URL}`,
      },
      { text: "Start the stack:", code: UP_CMD },
    ],
  },
];

export function DockerRunTabs() {
  const [active, setActive] = useState(0);
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = (active + dir + PLATFORMS.length) % PLATFORMS.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  const platform = PLATFORMS[active];

  return (
    <div
      className="animate-fade-in-up w-full rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-white/[0.02] p-5 text-left"
      style={{ animationDelay: "0.3s" }}
    >
      <p className="text-xs font-medium text-black/50 dark:text-white/50 mb-3">
        Run it locally with Docker Compose
      </p>

      <div
        role="tablist"
        aria-label="Operating system"
        onKeyDown={onKeyDown}
        className="flex gap-1 rounded-lg bg-black/5 dark:bg-white/10 p-1"
      >
        {PLATFORMS.map((p, i) => (
          <button
            key={p.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            role="tab"
            type="button"
            id={`${baseId}-tab-${p.id}`}
            aria-selected={i === active}
            aria-controls={`${baseId}-panel-${p.id}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              i === active
                ? "bg-white dark:bg-white/15 text-black dark:text-white shadow-sm"
                : "text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel-${platform.id}`}
        aria-labelledby={`${baseId}-tab-${platform.id}`}
        className="mt-4"
      >
        <ol className="flex flex-col gap-3">
          {platform.steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-black/5 dark:bg-white/10 text-[11px] font-semibold text-black/50 dark:text-white/50">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-black/60 dark:text-white/60">
                  {step.text}
                </p>
                {step.code && (
                  <pre className="mt-1.5 overflow-x-auto rounded-md bg-zinc-900 dark:bg-black px-3 py-2 text-xs text-zinc-100 font-mono">
                    <code>{step.code}</code>
                  </pre>
                )}
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-black/40 dark:text-white/40">
          Then open{" "}
          <span className="font-mono text-black/60 dark:text-white/60">
            localhost:3000
          </span>{" "}
          — no cloud account required. Any Docker engine works; Rancher Desktop
          is just a free, license-friendly option.
        </p>
      </div>
    </div>
  );
}
