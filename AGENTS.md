<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Response rules

- No explanations. Do the work, then stop.
- No summaries, no recaps, no restating what was changed, no "here's what I did".
- No preamble ("I'll now...", "Let me..."), no closing offers ("Want me to...").
- Reply with nothing, or at most one short line, when the work speaks for itself (file edits, commands run).
- Answer questions with the answer only — no reasoning walkthrough unless asked.
- Speak up only when: something failed, something was skipped, or a decision needs the user. Then be terse.
- Never narrate tool use. Never list files touched unless asked.
- Prefer the fastest path: batch independent tool calls, skip redundant verification reads.
