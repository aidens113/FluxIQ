// The rows Core's `checked` lines name, per read and condition, in structured
// form beside the lines themselves.
//
// **Why (live run `run-mux6naez-6c20f26e`, R3-3).** The first test's judgement
// said, in Core's words, "Step 9: the condition "name" alone left out these rows
// the check names: Lumo Audio Drift Pro ...". The repair's first rerun of that
// read kept all three; nothing told the model so, and it reran the same read
// six more times instead of completing. To tell it, the repair has to know which
// rows the check named and which condition of which read left them out, not
// only a sentence (`rerun-rows.ts` compares them with a rerun's rows).
//
// **Read from Core's own lines, against the summary they were made from.** The
// lines are Core's (`checked-rows.ts`, and the line a yes that passed over rows
// is downgraded with, `../verdict.ts`), and a build's judge holds them and the
// summary but not the judge's reply they were matched in. So a row is taken as
// named for a condition exactly when a line naming its read (`Step N`, `Read
// <node>`) and that condition (`the condition "..."`) lists the row's whole
// label as one of its rows -- after `: ` or `; `, and followed by the line's end,
// `;`, `.`, ` —` (the tested value) or ` (` with the ids it was named by or
// "also in the result". A label that only starts another label is not it. The
// lines themselves are left exactly as they are.

import type { AutomationStudioRunResultSummary } from "../contracts.ts";
import { automationStudioRequestRowsReads } from "./summary-reads.ts";
import type { AutomationStudioRequestRowsNamed, AutomationStudioRequestRowsRead } from "./types.ts";
import { automationStudioRequestRowIds } from "./words.ts";

/** What may follow a row's label in a line, after any parentheses: its end, `;`, `.`, or the tested value. */
const AFTER_LABEL = /^(?:$|[;.]| —)/u;
/** The parenthesis a line adds after a row it says is in the result too. */
const ALSO_IN_RESULT = "also in the result";

/** The rows Core's `checked` lines name, per read and condition, in the summary's order; none when they name none. */
export function automationStudioResultCheckedRowsNamed(summary: AutomationStudioRunResultSummary, checked: readonly string[]): AutomationStudioRequestRowsNamed[] {
  if (!checked.length) return [];
  const named: AutomationStudioRequestRowsNamed[] = [];
  for (const read of automationStudioRequestRowsReads(summary).reads) {
    const lines = checked.filter((line) => namesRead(line, read));
    if (!lines.length) continue;
    for (const condition of read.conditions) {
      const mention = `the condition "${condition.condition}"`;
      const rows: AutomationStudioRequestRowsNamed["rows"] = [];
      for (const label of [...new Set(condition.labels)]) {
        let found = false;
        const ids = new Set<string>();
        for (const line of lines) {
          const at = line.indexOf(mention);
          if (at < 0) continue;
          const said = rowSaid(line.slice(at + mention.length), label);
          if (!said) continue;
          found = true;
          for (const id of said) ids.add(id);
        }
        if (found) rows.push({ label, ...(ids.size ? { ids: [...ids] } : {}) });
      }
      if (rows.length) named.push({ ...(read.step !== undefined ? { step: read.step } : { nodeId: read.nodeId! }), condition: condition.condition, rows });
    }
  }
  return named;
}

/** Whether a line is about this read: `Step N` as a whole number, or `Read <node>`. */
function namesRead(line: string, read: AutomationStudioRequestRowsRead): boolean {
  if (read.step !== undefined) return new RegExp(`\\bStep ${read.step}(?!\\d)`, "u").test(line);
  return read.nodeId !== undefined && line.includes(`Read ${read.nodeId}`);
}

/** The ids a text lists the row by, when it lists the row as one of its rows; nothing when it does not. */
function rowSaid(text: string, label: string): string[] | undefined {
  for (let at = text.indexOf(label); at >= 0; at = text.indexOf(label, at + 1)) {
    const before = text.slice(Math.max(0, at - 2), at);
    if (before !== ": " && before !== "; ") continue;
    let rest = text.slice(at + label.length);
    const ids: string[] = [];
    // Each parenthesis after the label: the ids it was named by, or "also in the result".
    while (rest.startsWith(" (")) {
      const close = rest.indexOf(")");
      if (close < 0) break;
      const inside = rest.slice(2, close);
      const parts = inside.split(",").map((part) => part.trim());
      if (inside === ALSO_IN_RESULT) rest = rest.slice(close + 1);
      else if (parts.every((part) => automationStudioRequestRowIds(part).join() === part.toUpperCase() && part.length > 0)) {
        ids.push(...parts.map((part) => part.toUpperCase()));
        rest = rest.slice(close + 1);
      } else break;
    }
    if (AFTER_LABEL.test(rest)) return ids;
  }
  return undefined;
}
