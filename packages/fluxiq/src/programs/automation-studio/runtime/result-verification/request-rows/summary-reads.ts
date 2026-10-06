// The rows a summary holds, read per list read: what it kept, what is in the
// result, and what each condition alone left out.
//
// Two senders, one shape. A build test's replayed read carries `readRows` in a
// step's `observed` (`../build-test/read-rows.ts`): the rows it returned, and per
// condition the rows that condition alone left out. A finished run carries its
// stored rows in its record sets' samples and, per read, each condition's
// `leftOutOnlyByThis` (`../read-account/accounts.ts`). A run's stored rows are
// not split by the read that stored them -- live run `run-muw60j7c-bb7c9a62`
// appended an unfiltered read's 20 rows beside its filtered read's 10 -- so a
// run's read is taken to have kept every stored row that no condition of its own
// left out alone.
//
// **Whether a condition tested the row's own label** (`types.ts`, `testedLabel`)
// is read differently from each. A build test's replay sends the tested cell
// after every label it did not test, an empty one as `(no value)`, so a
// condition whose rows are all said by label alone tested the label. A run's
// account says it itself (`../read-account/accounts.ts`), from the authored
// condition: a run's row said by its label alone may only be a row whose tested
// column was not stored -- live run `run-mux6naez-6c20f26e` stored name, price,
// rating and url, and its `plus is present` rows, so said, were taken as tests
// of the name.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioResultRecordSetSummary, AutomationStudioRunResultSummary } from "../contracts.ts";
import type { AutomationStudioRequestRowsCondition, AutomationStudioRequestRowsRead, AutomationStudioRequestRowsStored } from "./types.ts";

/** A left-out row said with the value its condition tested after its label (`../read-account/alone-rows.ts`). */
const TESTED_VALUE = /^(.+?) — (?:\(withheld\)|[\p{L}\p{N}_.$@-]{1,64}: .*)$/su;

/** Every list read a summary holds rows for, and a run's stored rows. */
export function automationStudioRequestRowsReads(summary: AutomationStudioRunResultSummary): { reads: AutomationStudioRequestRowsRead[]; stored: AutomationStudioRequestRowsStored[] } {
  const stored = summary.recordSets.flatMap(storedRows);
  const reads: AutomationStudioRequestRowsRead[] = [];
  for (const step of summary.buildTest?.steps ?? []) {
    const sent = isObject(step.observed) ? step.observed.readRows : undefined;
    if (!isObject(sent)) continue;
    const rows = strings(sent.rows);
    const conditions = Array.isArray(sent.leftOutOnlyByThis)
      ? sent.leftOutOnlyByThis.flatMap((entry) => {
        if (!isObject(entry) || typeof entry.condition !== "string") return [];
        const rows = strings(entry.rows);
        return [condition(entry.condition, rows, rows.length > 0 && rows.every((row) => !TESTED_VALUE.test(row)))];
      })
      : [];
    reads.push(read({ step: step.step }, rows, rows, conditions));
  }
  const storedLabels = unique(stored.map((row) => row.label));
  for (const account of summary.reads ?? []) {
    const conditions = (account.conditions ?? []).flatMap((entry, index) =>
      entry.leftOutOnlyByThis?.length ? [condition(entry.condition ?? `condition ${index + 1}`, entry.leftOutOnlyByThis, entry.testedLabel === true)] : []);
    const leftOut = new Set(conditions.flatMap((entry) => entry.labels));
    reads.push(read({ nodeId: account.nodeId }, storedLabels.filter((label) => !leftOut.has(label)), storedLabels, conditions));
  }
  return { reads, stored };
}

/** A left-out row's label: the row as given, less the tested value said after it. */
export function automationStudioRequestRowLabel(row: string): string {
  return TESTED_VALUE.exec(row)?.[1] ?? row;
}

function read(at: { step: number } | { nodeId: string }, kept: string[], inResult: string[], conditions: AutomationStudioRequestRowsCondition[]): AutomationStudioRequestRowsRead {
  return { ...at, kept: unique(kept), inResult: unique(inResult), conditions, labels: unique([...kept, ...inResult, ...conditions.flatMap((entry) => entry.labels)]) };
}

function condition(name: string, rows: string[], testedLabel: boolean): AutomationStudioRequestRowsCondition {
  return { condition: name, rows, labels: rows.map(automationStudioRequestRowLabel), testedLabel };
}

/** A record set's sampled rows, each by its label -- its first column holding text -- and every text cell. */
function storedRows(set: AutomationStudioResultRecordSetSummary): AutomationStudioRequestRowsStored[] {
  return (set.sampleRows ?? []).flatMap((row: JsonObject) => {
    const cells = Object.values(row).filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    const column = set.columns.find((id) => typeof row[id] === "string" && (row[id] as string).trim().length > 0);
    const label = column !== undefined ? (row[column] as string) : cells[0];
    return label === undefined ? [] : [{ label, cells }];
  });
}

function strings(value: JsonValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
