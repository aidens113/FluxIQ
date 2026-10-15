// Core's own record of a judged result, as a no is weighed against it (t607):
// the rows the result holds, each by its columns; the rows each condition of
// each read alone left out, and which of them Core settled; the count stored
// and the repeats the answer's dedupe removed; and the request's item phrase.
// Read from the summary the judges were sent, never from a model's words.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioRunResultSummary } from "../contracts.ts";
import { automationStudioRequestPhrases, automationStudioRequestRowsReads, type AutomationStudioRequestPhrases, type AutomationStudioRequestWording } from "../request-rows/index.ts";
import type { AutomationStudioResultNoClaim, AutomationStudioResultNoRecord, AutomationStudioResultNoStoredRow } from "./types.ts";

/** The record a no is weighed against (header). `requestText` gives the item phrase, `wording` the request's own words; `other` checks the claims the agreement checks itself. */
export function automationStudioResultNoRecord(input: {
  summary: AutomationStudioRunResultSummary;
  requestText?: string | undefined;
  wording?: AutomationStudioRequestWording | undefined;
  other?: ((sentence: string) => AutomationStudioResultNoClaim | undefined) | undefined;
}): AutomationStudioResultNoRecord {
  const { summary } = input;
  const { reads } = automationStudioRequestRowsReads(summary);
  const stored = summary.recordSets.flatMap((set) => (set.sampleRows ?? []).flatMap((row) => storedRow(row, set.columns)));
  const leftOut = reads.flatMap((read) => read.conditions.flatMap((condition) => condition.rows.map((given, index) => {
    const label = condition.labels[index]!;
    return { label, given, condition: condition.condition, settled: condition.settled?.labels.includes(label) === true };
  })));
  const storedLabels = [...new Set(stored.map((row) => row.label))];
  const pools = [...reads.map((read) => [...new Set([...read.labels, ...storedLabels])]), storedLabels];
  const tested = summary.buildTest?.stores;
  const phrases = input.requestText?.trim() ? automationStudioRequestPhrases(input.requestText) : undefined;
  return {
    stored,
    leftOut,
    pools,
    storedCount: tested ? tested.reduce((total, store) => total + store.answer.rows, 0) : summary.totalRecordCount,
    duplicatesRemoved: summary.recordSets.reduce((total, set) => total + (set.processing?.duplicates ?? 0), 0),
    duplicatesCounted: summary.recordSets.length > 0 && summary.recordSets.every((set) => set.processing !== undefined)
      && !(tested ?? []).some((store) => (store.removed?.duplicates ?? 0) > 0),
    nodeIds: summary.flowShape.map((step) => step.nodeId),
    ...(phrases ? { phrases, item: itemOf(storedLabels, phrases) } : {}),
    ...(input.wording ? { says: input.wording.says } : {}),
    ...(input.other ? { other: input.other } : {})
  };
}

/** A stored row by its text cells, labelled by its first text column, as `../request-rows/summary-reads.ts` labels it. */
function storedRow(row: JsonObject, columns: readonly string[]): AutomationStudioResultNoStoredRow[] {
  const cells: Record<string, string> = {};
  for (const [column, value] of Object.entries(row)) if (typeof value === "string" && value.trim()) cells[column] = value;
  const column = columns.find((id) => cells[id] !== undefined) ?? Object.keys(cells)[0];
  return column === undefined ? [] : [{ label: cells[column]!, cells }];
}

/**
 * The phrase every stored row names first, where it is a phrase of the
 * request: what `../request-rows/left-out-naming-the-item.ts` calls the item.
 * None when a row names no phrase, or they do not agree.
 */
function itemOf(labels: readonly string[], phrases: AutomationStudioRequestPhrases): string[] | undefined {
  let common: string[] | undefined;
  for (const label of labels) {
    const first = phrases.phrasesOf(label)[0];
    if (!first) return undefined;
    common = common === undefined ? first.words : commonStart(common, first.words);
    if (common.length < 2) return undefined;
  }
  return common && phrases.isPhrase(common) ? common : undefined;
}

function commonStart(left: readonly string[], right: readonly string[]): string[] {
  const shared: string[] = [];
  for (let index = 0; index < Math.min(left.length, right.length) && left[index] === right[index]; index += 1) shared.push(left[index]!);
  return shared;
}
