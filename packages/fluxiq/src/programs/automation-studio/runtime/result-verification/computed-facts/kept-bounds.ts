// Every `where` bound Core can read holds on every row the read kept
// (extending `../value-readings/settled-rows.ts`).
//
// **Why.** A judge asked to "compare the included cohort ... state how each
// tested value meets or fails" decides what Core can measure: a stored row's
// own value against the bound its read was authored with
// (`fhl-core-judging.md`, row 1). `../value-readings/settled-rows.ts` settles
// the rows a condition left out; this reads the other side, the rows a read
// kept and the answer stored, by the same semantics
// (`automationStudioResultStoredValueAgainst`). A read that answered with its
// unfiltered rows (`unfiltered`) is the plainest case: every row it stored
// failed its conditions.
//
// **What Core reads, only what it measured.** For each read with conditions,
// the record sets only it collected (every pass of the set names it) that can
// hold the answer (not working rows, `../read-account/working-sets.ts`). For
// each of its conditions, the condition as authored, by the summary's own copy
// of the step (`../located-defects/condition-authored.ts`; never its wording
// read back), on the stored column it tests
// (`../read-account/condition.ts`), read in Core's own grammar. Each stored row's
// cell in that column is the tested value: a value, or empty where the row
// stores it blank. A withheld value, a column the row does not carry, a value
// stating no number for a bound, a date bound, or a condition that is not a
// numeric bound, a text test or a presence test alone says nothing.
//
// **A failing row is a no only where the request states the bound.** Core read
// the row against the condition as written; that the condition is the
// request's, Core can show only from the request's own words: a sentence of it
// stating the bound's number, the words a text test looks for, or the column a
// presence test asks a value of. That sentence is the defect's `requestWords`.
// Where no sentence states it, the row may be one the request asks for under a
// condition the build added, and the fact is left to the judge.
//
// **The fact.** Fails with one `kept_not_asked` defect per stored row whose own
// value fails a stated condition, named by its label, column and value. Holds
// only where at least one condition was read, every stored row of every set
// read was read back, and every reading held. Otherwise nothing.

import { parseAutomationStudioRecordCondition, type AutomationStudioRecordCondition } from "@fluxiq/contracts/automation-studio";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type {
  AutomationStudioResultComputedDefect,
  AutomationStudioResultComputedFact,
  AutomationStudioResultComputedFactsInput,
  AutomationStudioResultReadAccount,
  AutomationStudioResultRecordSetSummary,
  AutomationStudioRunResultSummary
} from "../contracts/index.ts";
import { automationStudioResultReadAuthoredCondition } from "../located-defects/index.ts";
import { automationStudioResultReadConditionColumn, automationStudioResultReadWorkingSets } from "../read-account/index.ts";
import { automationStudioResultStoredValueAgainst } from "../value-readings/index.ts";

/** What a screened cell reads as in a summary row (`../result-summary.ts`). */
const WITHHELD_VALUE = "[withheld]";
/** The keys that name what a condition tests, which Core's grammar names by `field`. */
const NAMING_KEYS: ReadonlySet<string> = new Set(["field", "read"]);
const TEXTS = ["contains", "startsWith", "endsWith"] as const;
const BOUNDS = ["atLeast", "atMost", "lessThan", "greaterThan"] as const;

/** What reading every condition on every row found: the failing rows, and whether every reading held and every row was read. */
type Readings = { defects: AutomationStudioResultComputedDefect[]; read: number; settled: boolean; columns: Set<string> };

/** Every `where` bound Core can read holds on every row the read kept (extending `../value-readings/settled-rows.ts`). None where Core cannot compute it. */
export function automationStudioResultKeptBoundsFact(input: AutomationStudioResultComputedFactsInput): AutomationStudioResultComputedFact[] {
  const { summary } = input;
  if (summary.buildTest || !summary.reads?.length) return [];
  const working = automationStudioResultReadWorkingSets(summary);
  const sentences = sentencesOf(input.requestText);
  const found: Readings = { defects: [], read: 0, settled: true, columns: new Set() };
  for (const read of summary.reads) {
    const sets = summary.recordSets.filter((set) => !working.has(set.datasetId) && collectedOnlyBy(set, read));
    for (const [index, entry] of (read.conditions ?? []).entries()) {
      const tested = conditionOf(summary, read, entry.number ?? index + 1);
      if (!tested) {
        found.settled = false;
        continue;
      }
      for (const set of sets) readSet(set, tested, sentences, found);
    }
  }
  if (found.defects.length) {
    const named = found.defects.map((defect) => `"${defect.row}" (${defect.column}: ${defect.value ?? "no value"})`).join(", ");
    return [{ kind: "kept_bounds", status: "fails", said: `Stored rows whose own value fails a condition of the read that kept them, a condition the request states: ${named}. Each is a row the request does not ask for.`, defects: found.defects }];
  }
  if (!found.settled || found.read === 0) return [];
  return [{ kind: "kept_bounds", status: "holds", said: `Settled by Core: every stored row's own value meets every condition of the read that kept it that Core reads (on ${[...found.columns].join(", ")}). Do not decide again whether a stored row meets those conditions.` }];
}

/** Whether every pass that collected the set is this read's (header): the rows are all its own. */
function collectedOnlyBy(set: AutomationStudioResultRecordSetSummary, read: AutomationStudioResultReadAccount): boolean {
  const passes = set.processing?.passes ?? [];
  return set.recordCount > 0 && passes.length > 0 && passes.every((pass) => pass.node === read.nodeId);
}

/** The condition as authored, in Core's grammar, on the stored column it tests; undefined where the summary does not hold it so. */
function conditionOf(summary: AutomationStudioRunResultSummary, read: AutomationStudioResultReadAccount, number: number): { condition: AutomationStudioRecordCondition; column: string } | undefined {
  const authored = automationStudioResultReadAuthoredCondition(summary.flowShape, read, number);
  if (!authored) return undefined;
  const column = automationStudioResultReadConditionColumn(authored.condition, authored.fields);
  if (column === undefined) return undefined;
  const rest = Object.fromEntries(Object.entries(authored.condition).filter(([key]) => !NAMING_KEYS.has(key)));
  const condition = parseAutomationStudioRecordCondition({ ...rest, field: column });
  return condition ? { condition, column } : undefined;
}

/** Each stored row of `set` against the condition (header), into `found`. */
function readSet(set: AutomationStudioResultRecordSetSummary, tested: { condition: AutomationStudioRecordCondition; column: string }, sentences: readonly string[], found: Readings): void {
  const rows = set.sampleRows ?? [];
  if (!set.columns.includes(tested.column) || rows.length !== set.recordCount) found.settled = false;
  if (!set.columns.includes(tested.column)) return;
  const stated = statedBy(tested.condition, tested.column, sentences);
  for (const row of rows) {
    const cell = cellOf(row, tested.column);
    const verdict = cell.known ? automationStudioResultStoredValueAgainst(tested.condition, cell.value) : undefined;
    if (!verdict) {
      found.settled = false;
      continue;
    }
    found.read += 1;
    found.columns.add(tested.column);
    if (verdict.verdict === "holds") continue;
    if (stated === undefined) {
      found.settled = false;
      continue;
    }
    found.defects.push({ kind: "kept_not_asked", row: labelOf(row, set.columns), column: tested.column, ...(cell.known && cell.value !== undefined ? { value: String(cell.value) } : {}), requestWords: stated });
  }
}

/** A row's cell in `column`: its value, `undefined` where it stores it blank; not known where it does not carry it, it was withheld, or it is not a scalar. */
function cellOf(row: JsonObject, column: string): { known: true; value: string | number | undefined } | { known: false } {
  if (!Object.hasOwn(row, column)) return { known: false };
  const value: JsonValue | undefined = row[column];
  if (value === null || (typeof value === "string" && !value.trim())) return { known: true, value: undefined };
  if (value === WITHHELD_VALUE) return { known: false };
  return typeof value === "string" || typeof value === "number" ? { known: true, value } : { known: false };
}

/** The request's sentence that states the condition (header): its bound's number, the words its text test looks for, or the column its presence test asks for. */
function statedBy(condition: AutomationStudioRecordCondition, column: string, sentences: readonly string[]): string | undefined {
  const numbers = BOUNDS.flatMap((key) => (typeof condition[key] === "number" ? [condition[key] as number] : []));
  const equals = condition.equals === undefined ? [] : Array.isArray(condition.equals) ? condition.equals : [condition.equals];
  numbers.push(...equals.filter((value): value is number => typeof value === "number"));
  const texts = [...TEXTS.flatMap((key) => listOf(condition[key])), ...equals.filter((value): value is string => typeof value === "string")].map((text) => text.trim().toLowerCase()).filter(Boolean);
  const comparesNothing = !numbers.length && !texts.length && condition.matches === undefined && BOUNDS.every((key) => condition[key] === undefined);
  return sentences.find((sentence) => {
    const lower = sentence.toLowerCase();
    if (numbers.length) return numbers.every((number) => numbersIn(sentence).includes(number));
    if (texts.length) return texts.some((text) => lower.includes(text));
    return comparesNothing && wordsOf(column).every((word) => lower.includes(word));
  });
}

function listOf(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

/** The numbers a sentence states, thousands separators read. */
function numbersIn(sentence: string): number[] {
  return [...sentence.matchAll(/\d[\d,]*(?:\.\d+)?/gu)].map((found) => Number(found[0].replaceAll(",", ""))).filter(Number.isFinite);
}

/** The request's sentences: its lines, each split where a sentence ends. */
function sentencesOf(requestText: string): string[] {
  return requestText.split(/\n+/u).flatMap((line) => line.split(/(?<=[.!?])\s+/u)).map((sentence) => sentence.trim()).filter(Boolean);
}

/** A column name's words, lower case: split at separators and where a lower-case letter meets an upper-case one. */
function wordsOf(name: string): string[] {
  return name.replace(/([a-z0-9])([A-Z])/gu, "$1 $2").toLowerCase().split(/[^a-z0-9]+/u).filter(Boolean);
}

/** A row's label: its first column holding text, as a read labels a row. */
function labelOf(row: JsonObject, columns: readonly string[]): string {
  const column = columns.find((id) => typeof row[id] === "string" && (row[id] as string).trim().length > 0 && row[id] !== WITHHELD_VALUE);
  return column === undefined ? JSON.stringify(columns.map((id) => row[id] ?? null)) : (row[column] as string);
}
