// The steps whose pages are the answer: the output step (`./output-step.ts`); before it the read steps that write the
// same named record output in turn, as a run of the saved Flow fills that output; and every other result read of the
// list the output step reads.
//
// **A named output filled in turn.** A read step's `recordOutput` names the dataset its rows go to and how: `append`
// adds them after what the output holds, anything else starts it over. A saved Flow runs its steps in draft order into
// those outputs, so where the output step appends, the output it leaves holds the rows of every earlier step appending
// to it, back to (and including) the last step that started it over. The answer is that output, so it holds the same
// rows: an answer of the output step alone would be another list than the one the saved Flow hands the next attempt
// (design rationale 2, "the answer and the saved Flow can no longer drift"). A check that fails, and a read added to
// answer it (`fluxiq.run`'s loop), is the common case: the model appends what it found next to what it found first.
//
// **Every result read of one list (t1091).** The draft keeps every read the model did not mark `purpose: intermediate`
// as a result read (answer-first's `isResult`, `runtime/flow-authoring/draft/compose/compose.ts`), and the saved Flow
// runs each of them, but the answer came from the last one only, so the two named different result reads. The
// provider-free kestrel harness (t1082, attempt 2) re-explored and read page 1 of the list with a new extraction (step
// 12), its `run_flow {from: 6}` read page 2 with the carried step 6, and the answer was step 12's 9 rows where step 6's
// page held the tenth. Two reads with different extractions are not folded (D2: their fields differ), and under the
// data-first rules (user, 2026-10-06 and 2026-11-20) they need not be: every read's rows collect into the run's dataset,
// the data layer dedupes and cleans them by its own row identity (`../result-feed/feed.ts`, `rows`), and the asked
// columns are placed over them by name (`./answer.ts`). So every result read of the output step's list joins the
// answer, whatever extraction it used. The list is the domain's `listKey` (made from the list's item selector and
// frame, so two extractions of one list share it), said by both steps, as a fold compares it (`./version.ts`, "must be
// said"): a step whose list was not said, and a read of another list, never joins.
//
// **Only under the list's latest state (lead, t1091 review).** A read the model took before it filtered, sorted or
// searched the list again on the site read another state of the list, and the later state supersedes it: bigbox reads,
// sorts through the site and reads again, and the answer is the sorted read alone. So a result read of the list joins
// only where every page it holds was read at the address the output step's latest page was read at: the page's
// `where`, the view of the site with only what turns the page taken out (`../rows/address-split.ts`), so page 1 and
// page 2 of one search share it and another filter, sort or search does not. That is the address the place rules
// already use (`./page-set.ts`, t1074; `../result-feed/returned-pages.ts`, t1085). Where the output step's latest page
// has no recorded address, or a read holds a page with none, nothing says the two were read under one state, and that
// read stays out: the answer falls back to the output step's alone, as before t1091. A read with no page joins nothing.
//
// One exception keeps the named output's own rule: a read of the list that writes the output the answer fills, and is
// not in that output's run of appends, was started over by the model, and stays out, as the saved Flow's output drops it.
//
// Only draft read steps take part, so a look never does (D1), and neither does a step marked `purpose: intermediate`.
// The steps are in draft order, the output step last (it stands last of every result read).
import { automationStudioAnswerFirstResultOutputStep } from "./output-step.ts";
import type { AutomationStudioAnswerFirstResultLedger, AutomationStudioAnswerFirstResultStep } from "./types.ts";

/** The answer's steps in draft order, the output step last; empty where no read step is the result. */
export function automationStudioAnswerFirstResultOutputGroup(ledger: AutomationStudioAnswerFirstResultLedger): readonly AutomationStudioAnswerFirstResultStep[] {
  const output = automationStudioAnswerFirstResultOutputStep(ledger);
  if (!output) return [];
  const appended = appendRun(ledger, output);
  const listKey = output.reads.listKey;
  const filled = output.writes?.datasetId;
  const state = latestAddress(output);
  const sameList = listKey === undefined || state === undefined
    ? []
    : ledger.steps.filter((step) => !appended.includes(step) && !step.intermediate && step.reads.listKey === listKey && (filled === undefined || step.writes?.datasetId !== filled)
      && step.pages.length > 0 && step.pages.every((page) => page.where === state));
  return [...appended, ...sameList].sort((one, other) => at(one) - at(other));
}

/** The output step, after the steps appending to its named output before it, back to the last that started it over. */
function appendRun(ledger: AutomationStudioAnswerFirstResultLedger, output: AutomationStudioAnswerFirstResultStep): AutomationStudioAnswerFirstResultStep[] {
  const writes = output.writes;
  if (!writes?.append) return [output];
  const outputAt = at(output);
  const earlier = ledger.steps
    .filter((step) => step !== output && !step.intermediate && step.writes?.datasetId === writes.datasetId && at(step) < outputAt)
    .sort((one, other) => at(other) - at(one));
  const group: AutomationStudioAnswerFirstResultStep[] = [output];
  for (const step of earlier) {
    group.unshift(step);
    if (!step.writes?.append) break;
  }
  return group;
}

/** The address the step's most recently read page was read at: the list's latest state (header); `undefined` where none was recorded. */
function latestAddress(step: AutomationStudioAnswerFirstResultStep): string | undefined {
  let latest: AutomationStudioAnswerFirstResultStep["pages"][number] | undefined;
  for (const page of step.pages) if (latest === undefined || page.seq > latest.seq) latest = page;
  return latest?.where;
}

/** Where a step stands in the draft: a step others were folded into stands where the last of them stands. */
function at(step: AutomationStudioAnswerFirstResultStep): number {
  return Math.max(step.position, ...step.folded.map((folded) => folded.position));
}
