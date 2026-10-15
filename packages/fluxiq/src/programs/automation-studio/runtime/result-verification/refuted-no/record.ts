// Core's own record of a judged result, as a no is weighed against it (t607):
// the rows the result holds, each by its columns; the rows each condition of
// each read alone left out, and which of them Core settled; the count stored
// and the repeats the answer's dedupe removed; and the request's item phrase.
// Read from the summary the judges were sent, never from a model's words.
//
// **And which settled rows fail the request's own words (t629).** A settled row
// of a read that kept rows, left out by a condition that tests text the request
// says (`./request-text-test.ts`), carries those words and the value its read's
// witness found on it (`leftOutObservations`, aligned with `leftOutOnlyByThis`):
// what a no calling it missing, or giving it another value, is held to
// (`./missing-claim.ts`, `./value-claim.ts`). A row two conditions of one name
// would give different readings is given none.
//
// **And every condition, and the values Core read (t631).** Each condition of
// the result, with how Core accounts for each row it alone left out
// (`./record-conditions.ts`): what a no's advice to change one is weighed
// against (`./advice-condition.ts`). And whether a text is a value Core read on
// a row -- a stored row's cell but its label, the tested value said after a
// left-out row's label, a witness's value -- and no row's label: a judge quoting
// such a value ("... whose value was "<value>"") names no row Core has no
// record of (`./named-rows.ts`).

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioRunResultSummary } from "../contracts.ts";
import { automationStudioResultConditionName } from "../read-account/index.ts";
import {
  automationStudioRequestPhrases,
  automationStudioRequestRowLabel,
  automationStudioRequestRowsReads,
  type AutomationStudioRequestPhrases,
  type AutomationStudioRequestWording
} from "../request-rows/index.ts";
import { automationStudioResultNoConditions } from "./record-conditions.ts";
import { automationStudioResultRequestTextTest } from "./request-text-test.ts";
import type { AutomationStudioResultNoClaim, AutomationStudioResultNoLeftOutRow, AutomationStudioResultNoRecord, AutomationStudioResultNoStoredRow } from "./types.ts";

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
  const quotes = requestQuotes(summary, input.requestText, input.wording?.says);
  const leftOut = reads.flatMap((read) => read.conditions.flatMap((condition) => condition.rows.map((given, index) => {
    const label = condition.labels[index]!;
    const settled = condition.settled?.labels.includes(label) === true;
    const quoted = settled ? quotes.get(quoteKey(condition.condition, label)) ?? undefined : undefined;
    return { label, given, condition: condition.condition, settled, quotesRequest: quoted !== undefined, ...(quoted ? { quoted } : {}) };
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
    conditions: automationStudioResultNoConditions(summary, leftOut, new Set(storedLabels)),
    isValue: valuesOf(summary, stored, leftOut),
    ...(phrases ? { phrases, item: itemOf(storedLabels, phrases) } : {}),
    ...(input.wording ? { says: input.wording.says } : {}),
    ...(input.other ? { other: input.other } : {})
  };
}

type Quoted = NonNullable<AutomationStudioResultNoLeftOutRow["quoted"]>;

/** A left-out row's key: its condition as named, and its label. */
function quoteKey(condition: string, label: string): string {
  return `${condition}\u0000${label}`;
}

/**
 * Each settled row of a read that kept rows whose condition tests the
 * request's own words, by condition and label: those words, and the value the
 * row's witness found (header). `null` where one key would read two ways.
 */
function requestQuotes(summary: AutomationStudioRunResultSummary, requestText: string | undefined, says: ((text: string) => boolean) | undefined): Map<string, Quoted | null> {
  const quotes = new Map<string, Quoted | null>();
  if (!requestText || !says) return quotes;
  // A subflow trial's entry is judged in its own trial, as `../request-rows/summary-reads.ts` leaves it out.
  const entry = new Set(summary.taskChecklist?.entry?.steps ?? []);
  for (const account of summary.reads ?? []) {
    // A read that kept no row shows no value passing its conditions: what it tests may not be what the request means.
    if (entry.has(account.nodeId) || !(account.kept > 0)) continue;
    (account.conditions ?? []).forEach((condition, index) => {
      if (!condition.leftOutSettled?.length || !condition.leftOutOnlyByThis?.length) return;
      const texts = automationStudioResultRequestTextTest(condition.condition, requestText, says);
      if (!texts) return;
      const name = automationStudioResultConditionName(condition.number ?? index + 1, condition.condition);
      const settled = new Set(condition.leftOutSettled);
      condition.leftOutOnlyByThis.forEach((row, at) => {
        const witness = condition.leftOutObservations?.[at];
        if (!settled.has(row) || witness?.state !== "present") return;
        const key = quoteKey(name, automationStudioRequestRowLabel(row));
        const known = quotes.get(key);
        quotes.set(key, known === undefined || known?.read === witness.value ? { texts, read: witness.value } : null);
      });
    });
  }
  return quotes;
}

/** A tested value said after a left-out row's label (`../read-account/alone-rows.ts`). */
const SAID_VALUE = / — [\p{L}\p{N}_.$@-]{1,64}: (.+)$/su;

/** Whether a text is a value Core read on a row and no row's label (header), compared folded. */
function valuesOf(summary: AutomationStudioRunResultSummary, stored: readonly AutomationStudioResultNoStoredRow[], leftOut: readonly AutomationStudioResultNoLeftOutRow[]): (text: string) => boolean {
  const labels = new Set([...stored.map((row) => fold(row.label)), ...leftOut.map((row) => fold(row.label))]);
  const values = new Set<string>();
  for (const row of stored) for (const cell of Object.values(row.cells)) if (cell !== row.label) values.add(fold(cell));
  for (const row of leftOut) {
    const said = SAID_VALUE.exec(row.given)?.[1];
    if (said) values.add(fold(said));
  }
  for (const account of summary.reads ?? []) {
    for (const condition of account.conditions ?? []) {
      for (const witness of condition.leftOutObservations ?? []) if (witness?.state === "present") values.add(fold(witness.value));
    }
  }
  return (text) => {
    const folded = fold(text);
    return folded.length > 0 && values.has(folded) && !labels.has(folded);
  };
}

/** A text as values are compared: lower case, each run of spaces one, no closing stop or comma. */
function fold(text: string): string {
  return text.toLowerCase().replace(/\s+/gu, " ").replace(/[\s.,;:]+$/u, "").trim();
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
