// Every condition the judged result was read with, as Core's account gives
// it, and how Core's record accounts for each row it alone left out (t631):
// what a no's advice to change, remove or loosen a condition is weighed
// against (`./advice-condition.ts`).
//
// **Which conditions.** Each condition of each read account the summary holds,
// and each `where` condition of each record set's saved answer
// (`recordOutput.process.where`), named as every line names it
// (`../read-account/condition-name.ts`) -- including those that left no row out
// alone, which `../request-rows/summary-reads.ts` passes over. Not the reads, or
// the record sets, of a subflow trial's entry: they are judged in their own
// trial (`../request-rows/summary-reads.ts`, t599).
//
// **Which rows Core can say.** A condition's rows are known only where its read
// counted the rows it alone left out (`alone`) and sent every one
// (`leftOutOnlyByThis`): `alone: 0` is a condition that left out no row by
// itself. Each such row is accounted for where it is also a row of the result
// (another copy kept, as `../request-rows/summary-with-also-in-result.ts` marks
// it on the judge's copy) or where Core settled it on a condition testing the
// request's own words (`./record.ts`, `quotesRequest`). A numeric bound's
// settled row is not: Core read that it fails the bound as written, never that
// the bound is the request's.

import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultConditionName } from "../read-account/index.ts";
import { automationStudioRequestRowLabel } from "../request-rows/index.ts";
import type { AutomationStudioResultNoCondition, AutomationStudioResultNoLeftOutRow } from "./types.ts";

/** How a saved answer's condition is named among a read's (`../request-rows/summary-reads.ts`). */
const PROCESSING_CONDITION = "recordOutput.process.where";
/** What a label that may not be said reads as (`../read-account/alone-rows.ts`). */
const WITHHELD_LABEL = "(withheld)";

/** One condition as an account or a saved answer carries it. */
type Counted = { number?: number | undefined; condition?: string | undefined; rejected?: number | undefined; alone?: number | undefined; leftOutOnlyByThis?: string[] | undefined };

/** Every condition of the judged result (header), `leftOut` the record's settled rows and `storedLabels` the labels of the rows the result holds. */
export function automationStudioResultNoConditions(summary: AutomationStudioRunResultSummary, leftOut: readonly AutomationStudioResultNoLeftOutRow[], storedLabels: ReadonlySet<string>): AutomationStudioResultNoCondition[] {
  const entry = new Set(summary.taskChecklist?.entry?.steps ?? []);
  const conditions: AutomationStudioResultNoCondition[] = [];
  const add = (nodeId: string, counted: Counted, index: number, prefix: string): void => {
    const number = counted.number ?? index + 1;
    const name = `${prefix}${automationStudioResultConditionName(number, counted.condition)}`;
    conditions.push({ name, number, nodeId, ...(counted.condition ? { wording: `${prefix}${counted.condition}` } : {}), rejected: counted.rejected, leftOut: rowsOf(name, counted, leftOut, storedLabels) });
  };
  for (const account of summary.reads ?? []) {
    if (entry.has(account.nodeId)) continue;
    (account.conditions ?? []).forEach((counted, index) => add(account.nodeId, counted, index, ""));
  }
  for (const set of summary.recordSets) {
    const passes = set.processing?.passes ?? [];
    if (entry.size > 0 && passes.length > 0 && passes.every((pass) => entry.has(pass.node))) continue;
    (set.processing?.conditions ?? []).forEach((counted, index) => add(passes[0]?.node ?? set.datasetId, counted, index, `${PROCESSING_CONDITION} `));
  }
  return conditions;
}

/** The rows one condition alone left out, each accounted for where Core's record does; none where they are not all known (header). */
function rowsOf(name: string, counted: Counted, leftOut: readonly AutomationStudioResultNoLeftOutRow[], storedLabels: ReadonlySet<string>): AutomationStudioResultNoCondition["leftOut"] {
  const rows = counted.leftOutOnlyByThis ?? [];
  if (counted.alone === undefined || rows.length < counted.alone) return undefined;
  return rows.map((row) => {
    const label = automationStudioRequestRowLabel(row);
    if (label !== WITHHELD_LABEL && storedLabels.has(label)) return { label, accounted: { by: "also_in_result" as const } };
    const settled = leftOut.filter((one) => one.condition === name && one.label === label);
    const quoted = settled.length > 0 && settled.every((one) => one.quotesRequest) ? settled[0]!.quoted : undefined;
    return { label, ...(quoted ? { accounted: { by: "request_words" as const, texts: quoted.texts } } : {}) };
  });
}
