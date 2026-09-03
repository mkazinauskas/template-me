export function TemplateSearchForm({ defaultValue }: { defaultValue?: string }) {
  return (
    <form method="GET" className="flex gap-2">
      <div className="relative flex-1">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground-subtle"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
            clipRule="evenodd"
          />
        </svg>
        <input
          type="search"
          name="q"
          defaultValue={defaultValue}
          placeholder="Search templates by name or file…"
          aria-label="Search templates"
          className="w-full rounded-md border border-black/15 dark:border-white/20 bg-transparent pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/30"
        />
      </div>
      <button
        type="submit"
        className="shrink-0 rounded-md border border-black/15 dark:border-white/20 px-4 py-2 text-sm font-medium hover:bg-black/[0.03] dark:hover:bg-white/[0.06]"
      >
        Search
      </button>
    </form>
  );
}
