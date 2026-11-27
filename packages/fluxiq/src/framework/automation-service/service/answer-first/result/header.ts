// The result header (I2): the statement every model request carries in a fixed slot, as the current view is carried.
//
// It is worked out from the ledger on every request, so it cannot go stale. What it replaces could: a Flow run's note
// copied rows and pages from the last pass that changed the result, and in run-mwbk0twg said 11 rows on 1 page while
// the result held 16, which cost 14 browser calls and three repeated setups. It holds counts and ids, never rows:
// rows are a recall away. Template (design (b)1):
//
//   Result: step 9 (v2: 4 conditions), 16 rows over 2 pages: page=1 (11), page=2 (5); columns name, price, rating;
//   the list ended after page=2 (no next page). Working reads, not the answer: step 3 (1 page, 4 rows). Looks not in
//   it: call p1.read.7 (12 rows).
//
// Every look that kept rows is named; looks that kept none are counted. Nothing is cut.
//
// **The columns are the rows' own, beside the ones the request names (t1032).** Run-mwv5m906-5e999159 was asked for a
// table with columns item, quantity and price, and its result was a product listing read with name, price, rating,
// pickup and url. The header said "columns item, quantity, price", the request's words, as if the rows held them, and
// the model never saw from it that the result was not the table asked for. Where a named column is one the rows do not
// hold (`runtime/result-verification/asked-words/held-column.ts`), the header now says which columns the rows hold and which named ones they lack: the
// answer's columns after processing where the feed gives them, else the read's.
//
// **Paging is not yet checked only for a list that pages (t1032).** The same run's header said "paging after unplaced
// read 1 not yet checked" for a list whose detection declared no pager, and the model spent 24 decisions looking for
// one. Where the domain declared that the step's list shows no way to another page (`../result-feed/list-pager.ts`),
// the header says it holds one page; a list declared to page, or not declared, is still not yet checked until a move
// or a run's pass settles it.
import { automationStudioAnswerFirstResultAnswer } from "./answer.ts";
import { automationStudioResultHeldColumn } from "../../../../../runtime/result-verification/index.ts";
import { automationStudioAnswerFirstResultCoverage } from "./coverage.ts";
import { automationStudioAnswerFirstResultOutputGroup } from "./output-group.ts";
import { automationStudioAnswerFirstResultWords as words } from "./statement-words.ts";
import type { AutomationStudioAnswerFirstResultLedger, AutomationStudioAnswerFirstResultStep } from "./types.ts";

export function automationStudioAnswerFirstResultHeader(ledger: AutomationStudioAnswerFirstResultLedger, answerRows?: number, answerColumns?: readonly string[]): string {
  const group = automationStudioAnswerFirstResultOutputGroup(ledger);
  const sentences = [group.length ? `Result: ${resultWords(ledger, group, answerRows, answerColumns)}.` : `Result: no rows: ${ledger.steps.length ? "every read step in the draft is marked intermediate" : "the draft has no read step yet"}.`];
  const working = ledger.steps.filter((step) => !group.includes(step)).sort((one, other) => one.position - other.position);
  if (working.length) sentences.push(`Working reads, not the answer: ${working.map((step) => `${words.step(step)} (${words.pageCount(step.pages.length)}, ${words.rows(words.keptCount(step))})`).join(", ")}.`);
  const holding = ledger.looks.filter((look) => look.kept.length > 0);
  const empty = ledger.looks.length - holding.length;
  if (holding.length) sentences.push(`Looks not in it: ${holding.map((look) => words.look(look)).join(", ")}${empty ? `; ${empty} more ${empty === 1 ? "look" : "looks"} kept no rows` : ""}.`);
  else if (empty) sentences.push(`Looks not in it: ${empty} ${empty === 1 ? "look" : "looks"}, which kept no rows.`);
  return sentences.join(" ");
}

function resultWords(ledger: AutomationStudioAnswerFirstResultLedger, group: readonly AutomationStudioAnswerFirstResultStep[], answerRows?: number, answerColumns?: readonly string[]): string {
  const kept = group.reduce((sum, step) => sum + words.keptCount(step), 0);
  // Steps appending to one output, and the result reads of one list (`./output-group.ts`), are each named with their
  // own pages, then how they are one answer and the rows in all.
  const parts = group.length === 1
    ? [stepWords(group[0]!, answerRows ?? kept)]
    : [...group.map((step, index) => `${index ? "then " : ""}${stepWords(step, words.keptCount(step))}`), `${words.joined(group)}, ${words.rows(answerRows ?? kept)} in all`];
  if (answerRows !== undefined && answerRows !== kept) parts.push(`${words.rows(kept)} kept before result processing`);
  const columns = columnWords(ledger, group, answerColumns);
  if (columns) parts.push(columns);
  // The result reads of the output step's list say what was read of it once, from the pages of them all (`./coverage.ts`).
  const listKey = group.at(-1)!.reads.listKey;
  const together = listKey === undefined ? [] : group.filter((step) => step.reads.listKey === listKey);
  const covered = together.length > 1 ? [together, ...group.filter((step) => !together.includes(step))] : group;
  for (const read of covered) {
    const steps = Array.isArray(read) ? read : [read as AutomationStudioAnswerFirstResultStep];
    const coverage = coverageWords(steps, ledger.pagers);
    if (coverage) parts.push(steps.length === group.length ? coverage : `${steps.map((step) => words.step(step)).join(", ")}: ${coverage}`);
  }
  return parts.join("; ");
}

/** A step of the result by its version and pages, with `rows` as its count. */
function stepWords(step: AutomationStudioAnswerFirstResultStep, rows: number): string {
  const named = `${words.step(step)} (${words.version(step)})`;
  return step.pages.length ? `${named}, ${words.rows(rows)} over ${words.pageCount(step.pages.length)}: ${words.pages(step.pages)}` : `${named}, 0 rows: v${step.version} has read no page yet`;
}

function columnWords(ledger: AutomationStudioAnswerFirstResultLedger, group: readonly AutomationStudioAnswerFirstResultStep[], answerColumns?: readonly string[]): string | undefined {
  const contract = ledger.contract;
  if (!contract.sure) {
    const named = contract.columns.length ? `the request names ${contract.columns.join(", ")}, and perhaps` : "perhaps";
    const maybe = contract.maybe.length === 1 ? `"${contract.maybe[0]}"` : `one of ${contract.maybe.map((item) => `"${item}"`).join(", ")}`;
    return `columns not certain: ${named} ${contract.maybe.length ? maybe : "more"}`;
  }
  if (!contract.columns.length) {
    const read = [...new Set(group.flatMap((step) => Object.keys(step.reads.fields)))];
    return read.length ? `columns as read: ${read.join(", ")}` : undefined;
  }
  // The rows' own columns: as processing shaped them where the feed says, else as the answer holds them (header).
  const held = answerColumns ?? automationStudioAnswerFirstResultAnswer(ledger).columns;
  const lacking = contract.columns.filter((column) => automationStudioResultHeldColumn(column, held) === undefined);
  if (!lacking.length) return `columns ${contract.columns.join(", ")}`;
  return `columns asked: ${contract.columns.join(", ")}, but the rows hold ${held.length ? held.join(", ") : "no column"} (no ${lacking.join(" or ")})`;
}

/** What the steps (one, or the result reads of one list) have read of their list, in words. */
function coverageWords(steps: readonly AutomationStudioAnswerFirstResultStep[], pagers: AutomationStudioAnswerFirstResultLedger["pagers"]): string | undefined {
  const output = steps.at(-1)!;
  const coverage = automationStudioAnswerFirstResultCoverage(steps);
  if (!coverage.last) return undefined;
  const parts: string[] = [];
  if (coverage.first === "not read") parts.push("the first place is not among them");
  // The list's paging, plainly: a page follows, the end was reached, or not yet checked (t1013). A run's pass or a move
  // the model ran on the list's own page settles it (`../result-feed/list-move.ts`); an observed end is never unsettled.
  // A list the domain declared to show no way to another page holds one page, and nothing is left to check (header, t1032).
  const paging = coverage.last.paging;
  const listKey = output.reads.listKey;
  const pagerless = listKey !== undefined && pagers?.[listKey] === false;
  if (!paging) parts.push(pagerless ? "the list shows no pager, so it holds one page" : `paging after ${coverage.last.place} not yet checked`);
  else if (paging.verdict === "ended") parts.push(`the list ended after ${coverage.last.place} (${paging.reason})`);
  else parts.push(`a page follows ${coverage.last.place} (the list moved on), not read yet`);
  return parts.join("; ");
}
