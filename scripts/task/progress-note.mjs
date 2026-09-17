// Progress from a task command, as one JSON line per step on stderr.
//
// It goes to stderr because stdout carries the single JSON result an agent
// reads, and a progress line written there would corrupt it. `finish` runs
// Core's whole `pnpm check` between two merges and can sit for minutes with
// nothing to show, so a command that printed nothing would read as hung.

/** @param {Record<string, unknown>} line */
export function noteTaskProgress(line) {
  process.stderr.write(`${JSON.stringify({ scope: "task", ...line })}\n`);
}
