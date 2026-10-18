// The judge's copy of a summary, with each read condition's left-out rows whose
// item is also in the result said so (t624) -- and which read stored them
// (t691).
//
// **Why.** A8 bigbox `run-mv96rz6d-745e2940`: a presence condition alone left
// out six rows that were second copies of items whose first copy the read kept
// and stored. Judges 0052, 0053, 0084 and 0123 read them as items the Flow
// dropped and answered no over an exact answer. Core already knew: the check
// of a no's rows says " (also in the result)" (`checked-rows.ts`), and a yes is
// never asked to quote beside such a row (`unquoted-rows.ts`, `inResult`). The
// judge's evidence never said it.
//
// **Which rows.** A row of a read condition's `leftOutOnlyByThis` whose label
// -- the row as given, less Core's id and its tested value
// (`summary-reads.ts`) -- is a stored row's label in a record set the same read
// collected, or one whose collector Core cannot name (`summary-reads.ts`). A
// withheld label is no row's own, so it is never marked. They are listed, as
// given, in `leftOutAlsoInResult`, with `alsoInResult`, Core's sentence.
// Nothing else changes: the rows stay in `leftOutOnlyByThis`.
//
// **Not a row another read stored (t691).** A8 `run-mvbr0w7e-6a01c05b`: a
// read's condition left four rows out of what the Flow acted on, and a later
// read with no condition stored all eight. This file called the four "another
// copy of the same item ... kept", which vouched for exactly the rows the
// answer should not have held, and both judges said yes. A left-out row whose
// stored copies all came from other reads' record sets is listed instead in
// `storedThoughLeftOut`, with `storedAnyway`, Core's sentence naming those
// reads: the condition left them out of the act, and that read stored them,
// so a yes has to name each beside that read and the request's words that ask
// for it in the answer (`unquoted-rows.ts`). A library's example: renew the
// overdue books, then list the books now shown as renewed; a last read that
// also stores the books never renewed has to say why each is there.
//
// **Never a row Core settled (live-lane-1 fix 4).** Run `run-mvd8ypsv-32cde667`
// steps 0056 and 0057: a presence test alone left out five rows, all five in
// its `leftOutSettled` (Core read on each the value the request says to leave
// out), and four were also listed here. Both judges read the one left unlisted
// as missing and answered no over an exact answer. A settled row is already
// accounted for by its condition's own `settled`, so it is not listed here as
// well, and Core's sentence says that a row this list leaves out is not thereby
// missing: the condition's own entry accounts for it.
//
// **The judge's copy only.** As `summary-with-row-ids.ts`: the summary given is
// never changed, and the verdict reads the rows as before.

import type { AutomationStudioResultReadAccount, AutomationStudioRunResultSummary } from "../contracts/index.ts";
import type { AutomationStudioResultReadCondition } from "../read-condition.ts";
// The leaf, not the barrel: `../read-account/` reaches `../../llm/`, which reaches this directory (`summary-reads.ts`).
import { automationStudioResultConditionName } from "../read-account/condition-name.ts";
import { automationStudioRequestRowLabel, automationStudioRequestRowsReads, automationStudioRequestRowsStoredBy } from "./summary-reads.ts";
import type { AutomationStudioRequestRowsStoredMark } from "./types.ts";

/** What a label that may not be said reads as (`../read-account/alone-rows.ts`). */
const WITHHELD_LABEL = "(withheld)";

/** Core's sentence beside the marked rows (header). */
const ALSO_IN_RESULT = "Each row in leftOutAlsoInResult is one this condition alone left out whose label is also a row of the result: "
  + "another copy of the same item was kept, so that item is not missing from the result, and none of these rows is an item the condition took out of it. "
  + "A row this condition alone left out that leftOutAlsoInResult does not list is not thereby missing or wrongly left out: this list says only which rows came back by another copy, "
  + "and each other row is accounted for by this condition's own entry, by leftOutSettled and settled where it is listed there.";

/** Core's sentence beside the rows another read stored (header, t691). */
function storedAnyway(condition: string, by: readonly string[]): string {
  const reads = by.map((node) => `read ${node}`).join(" and ");
  return `In this read, ${condition} left the rows in storedThoughLeftOut out of what the Flow acted on, and ${reads} stored them: each is a row of the result, not another copy of a row this read kept. `
    + `A yes names each of them in a sentence that names ${reads} by its nodeId and quotes, in double quotes, the request's own words that ask for that row in the answer. `
    + "Where the request does not ask for a row in its answer, the result should not hold it, and the answer is no.";
}

/** The summary with each read condition's left-out rows that are also in the result, or that another read stored, marked (header); the same object when there are none. */
export function automationStudioResultSummaryWithAlsoInResult(summary: AutomationStudioRunResultSummary): AutomationStudioRunResultSummary {
  if (!summary.reads?.some((read) => read.conditions?.some((entry) => entry.leftOutOnlyByThis?.length))) return summary;
  const stored = new Set(automationStudioRequestRowsReads(summary, true).stored.map((row) => row.label));
  const storedBy = automationStudioRequestRowsStoredBy(summary.recordSets);
  let changed = false;
  const reads = summary.reads.map((read): AutomationStudioResultReadAccount => {
    if (!read.conditions?.length) return read;
    let marked = false;
    const conditions = read.conditions.map((entry, index): AutomationStudioResultReadCondition & AutomationStudioRequestRowsStoredMark => {
      const also: string[] = [];
      const elsewhere: string[] = [];
      const by = new Set<string>();
      // A row Core settled is accounted for by the condition's own `settled` (header, live-lane-1 fix 4).
      const settled = new Set((entry.leftOutSettled ?? []).map(automationStudioRequestRowLabel));
      for (const row of entry.leftOutOnlyByThis ?? []) {
        const label = automationStudioRequestRowLabel(row);
        if (label === WITHHELD_LABEL || !stored.has(label)) continue;
        const others = storedBy(read.nodeId, label);
        if (others) {
          elsewhere.push(row);
          for (const node of others) by.add(node);
        } else if (!settled.has(label)) also.push(row);
      }
      if (!also.length && !elsewhere.length) return entry;
      marked = true;
      return {
        ...entry,
        ...(also.length ? { leftOutAlsoInResult: [...new Set(also)], alsoInResult: ALSO_IN_RESULT } : {}),
        ...(elsewhere.length ? { storedThoughLeftOut: [...new Set(elsewhere)], storedAnyway: storedAnyway(automationStudioResultConditionName(entry.number ?? index + 1, entry.condition), [...by]) } : {})
      };
    });
    if (!marked) return read;
    changed = true;
    return { ...read, conditions };
  });
  return changed ? { ...summary, reads } : summary;
}
