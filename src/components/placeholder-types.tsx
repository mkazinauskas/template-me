const ROWS: { type: string; syntax: string; input: string; notes: string }[] = [
  {
    type: "String",
    syntax: "{{key}}",
    input: "Text field",
    notes: "Default — no |type needed.",
  },
  {
    type: "Number",
    syntax: '{{key|number(2)}}',
    input: "Number field",
    notes: "Decimal places (optional).",
  },
  {
    type: "Date",
    syntax: '{{key|date("yyyy-mm-dd")}}',
    input: "Date picker",
    notes: "Output format (optional).",
  },
  {
    type: "Boolean",
    syntax: '{{key|boolean("Yes","No")}}',
    input: "Toggle switch",
    notes: "On/off labels (optional).",
  },
  {
    type: "Select",
    syntax: '{{key|select("A","B")}}',
    input: "Dropdown",
    notes: "Options are required.",
  },
  {
    type: "Checkbox",
    syntax: "{{key|checkbox}}",
    input: "Checkbox",
    notes: "Renders ☒ when checked, ☐ otherwise.",
  },
];

export function PlaceholderTypes() {
  return (
    <details className="group rounded-lg border border-black/10 dark:border-white/15">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 select-none text-sm">
        <span className="font-medium">Placeholder types &amp; syntax</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="size-4 shrink-0 text-black/40 dark:text-white/40 transition-transform group-open:rotate-180"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </summary>

      <div className="flex flex-col gap-3 px-3 pb-3">
        <p className="text-xs text-black/60 dark:text-white/60">
          By default a tag is a plain text field. Add a{" "}
          <code className="font-mono">|type(...)</code> suffix to change what
          kind of input it gets, e.g.{" "}
          <code className="px-1 py-0.5 rounded bg-black/5 dark:bg-white/10">
            {'{{birthday|date("yyyy-mm-dd")}}'}
          </code>
          .
        </p>

        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.04] text-left">
                <th className="px-3 py-1.5 font-medium">Type</th>
                <th className="px-3 py-1.5 font-medium">Syntax</th>
                <th className="px-3 py-1.5 font-medium">Input</th>
                <th className="px-3 py-1.5 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr
                  key={row.type}
                  className={i < ROWS.length - 1 ? "border-b border-black/10 dark:border-white/15" : ""}
                >
                  <td className="px-3 py-2 align-top font-medium whitespace-nowrap">{row.type}</td>
                  <td className="px-3 py-2 align-top whitespace-nowrap">
                    <code className="px-1 py-0.5 rounded bg-black/5 dark:bg-white/10 font-mono">
                      {row.syntax}
                    </code>
                  </td>
                  <td className="px-3 py-2 align-top whitespace-nowrap">{row.input}</td>
                  <td className="px-3 py-2 align-top text-black/70 dark:text-white/70">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-black/60 dark:text-white/60">
          Group related fields with a dot prefix, e.g.{" "}
          <code className="px-1 py-0.5 rounded bg-black/5 dark:bg-white/10">
            {"{{person.first_name}}"}
          </code>{" "}
          — they&apos;ll appear together under one heading on the fill form.
        </p>
      </div>
    </details>
  );
}
