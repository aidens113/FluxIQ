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
import { automationStudioAnswerFirstResultCoverage } from "./coverage.ts";
import { automationStudioAnswerFirstResultOutputStep } from "./output-step.ts";
import { automationStudioAnswerFirstResultWords as words } from "./statement-words.ts";
import type { AutomationStudioAnswerFirstResultLedger, AutomationStudioAnswerFirstResultStep } from "./types.ts";

export function automationStudioAnswerFirstResultHeader(ledger: AutomationStudioAnswerFirstResultLedger): string {
  const output = automationStudioAnswerFirstResultOutputStep(ledger);
  const sentences = [output ? `Result: ${resultWords(ledger, output)}.` : `Result: no rows: ${ledger.steps.length ? "every read step in the draft is marked intermediate" : "the draft has no read step yet"}.`];
  const working = ledger.steps.filter((step) => step !== output).sort((one, other) => one.position - other.position);
  if (working.length) sentences.push(`Working reads, not the answer: ${working.map((step) => `${words.step(step)} (${words.pageCount(step.pages.length)}, ${words.rows(words.keptCount(step))})`).join(", ")}.`);
  const holding = ledger.looks.filter((look) => look.kept.length > 0);
  const empty = ledger.looks.length - holding.length;
  if (holding.length) sentences.push(`Looks not in it: ${holding.map((look) => words.look(look)).join(", ")}${empty ? `; ${empty} more ${empty === 1 ? "look" : "looks"} kept no rows` : ""}.`);
  else if (empty) sentences.push(`Looks not in it: ${empty} ${empty === 1 ? "look" : "looks"}, which kept no rows.`);
  return sentences.join(" ");
}

function resultWords(ledger: AutomationStudioAnswerFirstResultLedger, output: AutomationStudioAnswerFirstResultStep): string {
  const parts = [`${words.step(output)} (${words.version(output)})`];
  if (!output.pages.length) parts[0] += `, 0 rows: v${output.version} has read no page yet`;
  else parts[0] += `, ${words.rows(words.keptCount(output))} over ${words.pageCount(output.pages.length)}: ${words.pages(output.pages)}`;
  const columns = columnWords(ledger, output);
  if (columns) parts.push(columns);
  const coverage = coverageWords(output);
  if (coverage) parts.push(coverage);
  return parts.join("; ");
}

function columnWords(ledger: AutomationStudioAnswerFirstResultLedger, output: AutomationStudioAnswerFirstResultStep): string | undefined {
  const contract = ledger.contract;
  if (!contract.sure) {
    const named = contract.columns.length ? `the request names ${contract.columns.join(", ")}, and perhaps` : "perhaps";
    const maybe = contract.maybe.length === 1 ? `"${contract.maybe[0]}"` : `one of ${contract.maybe.map((item) => `"${item}"`).join(", ")}`;
    return `columns not certain: ${named} ${contract.maybe.length ? maybe : "more"}`;
  }
  if (contract.columns.length) return `columns ${contract.columns.join(", ")}`;
  const read = Object.keys(output.reads.fields);
  return read.length ? `columns as read: ${read.join(", ")}` : undefined;
}

function coverageWords(output: AutomationStudioAnswerFirstResultStep): string | undefined {
  const coverage = automationStudioAnswerFirstResultCoverage(output);
  if (!coverage.last) return undefined;
  const parts: string[] = [];
  if (coverage.first === "not read") parts.push("the first place is not among them");
  const paging = coverage.last.paging;
  if (!paging) parts.push(`nothing has said whether a page follows ${coverage.last.place}`);
  else if (paging.verdict === "ended") parts.push(`the list ended after ${coverage.last.place} (${paging.reason})`);
  else parts.push(`the list moved on after ${coverage.last.place} and nothing after it was read`);
  return parts.join("; ");
}
