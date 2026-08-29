const ROWS: { type: string; syntax: string; input: string; notes: string }[] = [
  {
    type: "String",
    syntax: "{{key}}",
    input: "Text field",
    notes: "Default type — a bare tag with no |type is treated as string.",
  },
  {
    type: "Number",
    syntax: '{{key|number(2)}}',
    input: "Number field",
    notes: "Optional decimal places to round/pad to. Omit to insert as typed.",
  },
  {
    type: "Date",
    syntax: '{{key|date("yyyy-mm-dd")}}',
    input: "Date picker",
    notes: 'Optional output format using yyyy/mm/dd tokens, e.g. "dd/mm/yyyy". Defaults to yyyy-mm-dd.',
  },
  {
    type: "Boolean",
    syntax: '{{key|boolean("Yes","No")}}',
    input: "Toggle switch",
    notes: 'Optional on/off labels (default "Yes"/"No"). Never required — off just renders as false.',
  },
  {
    type: "Select",
    syntax: '{{key|select("A","B")}}',
    input: "Dropdown",
    notes: "Arguments are the selectable options; the submitted value must be one of them.",
  },
];

export function PlaceholderTypes() {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">Placeholder types</h2>
        <p className="text-sm text-black/60 dark:text-white/60 mt-1">
          Add a <code className="font-mono">|type(...)</code> suffix to a tag
          to control which input it gets on the form.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/15">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.04] text-left">
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Tag syntax</th>
              <th className="px-4 py-2 font-medium">Form input</th>
              <th className="px-4 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, i) => (
              <tr
                key={row.type}
                className={i < ROWS.length - 1 ? "border-b border-black/10 dark:border-white/15" : ""}
              >
                <td className="px-4 py-2.5 align-top font-medium whitespace-nowrap">{row.type}</td>
                <td className="px-4 py-2.5 align-top whitespace-nowrap">
                  <code className="px-1 py-0.5 rounded bg-black/5 dark:bg-white/10 font-mono text-xs">
                    {row.syntax}
                  </code>
                </td>
                <td className="px-4 py-2.5 align-top whitespace-nowrap">{row.input}</td>
                <td className="px-4 py-2.5 align-top text-black/70 dark:text-white/70">{row.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-black/60 dark:text-white/60">
        Group related fields by prefixing keys with a dot, e.g.{" "}
        <code className="px-1 py-0.5 rounded bg-black/5 dark:bg-white/10">
          {"{{person.first_name}}"}
        </code>{" "}
        — fields sharing a group appear together under one heading on the
        fill form.
      </p>
    </div>
  );
}
