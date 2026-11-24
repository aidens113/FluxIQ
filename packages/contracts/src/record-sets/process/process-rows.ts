// A dataset's answer from its collected rows (P1, P3, P4, P8): the one pure
// function the run-end stage, the build test and any re-processing call.
//
// It applies the declaration in the read's established order -- `where`, then
// `dedupe`, then `sort`, then `limit`, then `columns` -- over every row the
// dataset collected in the run, whichever pass or node wrote it. With no
// declaration the answer is the collected rows in capture order with exact
// repeats dropped.
//
// **The default dedupe key is the whole row**: every stored field of the schema,
// or the answer's `columns` when it names them, so a row is dropped only when it
// carries nothing the answer would show that an earlier row did not. A key over
// a link column would merge distinct rows that share one link.
// Explicit automatic mode uses a complete declared identity, with whole-original
// fallback, and withholds an answer while required evidence is unavailable. A
// field the row's own read captured and the item does not show is not missing
// evidence: it reads as saved processing reads an absent value (t993,
// `not-shown.ts`).
//
// **Processing the answer again gives the same rows**: every step keeps what it
// kept, the sort is stable, and `parseAutomationStudioRecordProcessing` refuses a
// `where` over a column the answer drops. One edge is not closed: an `auto` sort
// key decides its kind over the rows it sorts, so a column whose values read as
// both numbers and dates may decide differently over the shorter answer.
//
// **Each `where` condition names the rows it alone left out (t493).** Live run
// `run-mv6bg8d8-1a461436`: `name not contains "Charging Case"` on the saved
// answer left out three items sold with a charging case beside two real
// accessories, the account said `filteredOut: 5`, and four judges read that as
// five accessories. A row every other condition keeps is named under the
// condition that left it out, by its label (`labelOf`), each label once: the
// rows a list read's account names per condition, so a judge reads both alike.
// Every such row is named, as a read names every one; the collected rows are
// already bounded by the dataset's own row limit.
//
// **A sort key the answer's `columns` leave out is recorded before they do
// (t515).** Live run `run-mv6v2kzn-d593231f` sorted its answer newest first by
// a date column it did not show, and the order was right and checked by
// nothing a judge could see; the model then added the column nobody asked for.
// So each such key's reading -- what the sort read it as, on how many rows,
// whether the rows run in its order (first key), and a few rows' values, never
// text -- goes on the account (`hiddenSortKeys`). The column stays stored and
// hidden; a re-processing still has it, and it is never forced into the answer.
//
// **A date bound counts the rows it could not date (t790).** Run
// `run-mvswewhy-e4e469d4` needed "on or after Saturday 19 September 2026" and
// could only write a pattern. A date bound now says it, and a row whose value
// states no date it can read is left out, never kept as matching; its account
// says how many such rows it left out (`undated`), beside the rows it names.
//
// **Derived columns, groups and comparisons (t970).** `derive` computes its
// columns on a copy of each row before the filters (`derive.ts`); the filters
// are every `where` condition, then every `anyOf` group (`any-of.ts`), then
// every `compare` (`field-comparison.ts`), and a row is kept only when each
// holds. A group or comparison names the rows it alone left out as a condition
// does, on the account's `filters`. The answer is each kept row's own stored
// values: a derived column is never in it.

import { automationStudioRecordAnyOfFields, automationStudioRecordAnyOfText } from "./any-of.ts";
import { automationStudioRecordAutomaticIdentity } from "./automatic-identity.ts";
import { cellOf, cellText } from "./cell-text.ts";
import { automationStudioRecordConditionComparesDates } from "./compares-dates.ts";
import { automationStudioRecordConditionHolds, automationStudioRecordConditionText } from "./condition/index.ts";
import { automationStudioRecordDerivedValues } from "./derive.ts";
import { automationStudioRecordFieldComparisonFields, automationStudioRecordFieldComparisonText } from "./field-comparison.ts";
import { automationStudioRecordNotShown } from "./not-shown.ts";
import { AUTOMATION_STUDIO_RECORD_PROCESSING_LIMITS } from "./processing-vocabulary.ts";
import { parseAutomationStudioRecordCondition } from "./parse-condition.ts";
import { automationStudioRecordProcessingFilterChecks, automationStudioRecordRequiredValueIssue, type AutomationStudioRecordProcessingMissingEvidence, type AutomationStudioAutomaticRecordProcessRowsResult } from "./readiness/index.ts";
import { readAutomationStudioRecordConditionDate } from "./row-date.ts";
import { automationStudioRecordRowIdentity } from "./row-identity.ts";
import { sortAutomationStudioRecordRows } from "./sort-rows.ts";
import { automationStudioRecordAutoSortKind, readAutomationStudioRecordSortValue } from "./sort-value.ts";
import type { AutomationStudioRecordSchema } from "../schema.ts";
import type {
  AutomationStudioRecordCondition,
  AutomationStudioRecordProcessing,
  AutomationStudioRecordProcessingAccount,
  AutomationStudioRecordProcessingConditionAccount,
  AutomationStudioRecordProcessingFilterAccount,
  AutomationStudioRecordProcessingHiddenSortKey,
  AutomationStudioRecordProcessingPass,
  AutomationStudioRecordProcessingTestedValue,
  AutomationStudioRecordSortKey
} from "./types.ts";

/** The most answer rows whose hidden sort value is recorded per key. */
const HIDDEN_SORT_READINGS = 4;
/** Text compared as the sort compares it (`sort-rows.ts`). */
const ORDER_COLLATOR = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** One collected row: its stored values, the node that wrote it, and the batch (one pass's attempt) it was written in. */
export type AutomationStudioRecordCollectedRow = {
  values: Readonly<Record<string, unknown>>;
  nodeId: string;
  batchKey: string;
  /**
   * The stored field ids the row's own read captured: its batch's own schema (`automationStudioRecordCapturedFields`).
   * In automatic processing a captured field's absent or blank cell is a value the item did not show (`not-shown.ts`,
   * t993); a field outside it, or every field when this is absent, stays missing evidence. Saved processing ignores it.
   */
  captured?: readonly string[];
};

export type AutomationStudioRecordProcessRowsInput = {
  /** In capture order: pass order, then page order within a pass. */
  rows: readonly AutomationStudioRecordCollectedRow[];
  /** The record output's schema; `exclude` fields are not stored and never part of the default key. */
  schema: AutomationStudioRecordSchema;
  process?: AutomationStudioRecordProcessing;
  /** Epoch milliseconds that relative dates ("3 days ago") are measured back from. */
  now: number;
  /** Absent preserves saved processing's existing identity and missing-value semantics. */
  mode?: "legacy";
};

export type AutomationStudioAutomaticRecordProcessRowsInput = Omit<AutomationStudioRecordProcessRowsInput, "mode"> & { mode: "automatic" };

export type AutomationStudioRecordProcessRowsResult = {
  /** The answer, as fresh objects in answer order. */
  rows: Record<string, unknown>[];
  /** The exact selected originals: allowed schema fields and enumerable own symbol metadata, with no derived columns. Symbols never enter JSON. */
  retainedRows: Record<string, unknown>[];
  account: AutomationStudioRecordProcessingAccount;
};

/** One evaluator; automatic declarations require readable evidence before returning answer rows. */
export function processAutomationStudioRecordRows(input: AutomationStudioAutomaticRecordProcessRowsInput): AutomationStudioAutomaticRecordProcessRowsResult;
export function processAutomationStudioRecordRows(input: AutomationStudioRecordProcessRowsInput): AutomationStudioRecordProcessRowsResult;
export function processAutomationStudioRecordRows(input: AutomationStudioRecordProcessRowsInput | AutomationStudioAutomaticRecordProcessRowsInput): AutomationStudioRecordProcessRowsResult | AutomationStudioAutomaticRecordProcessRowsResult {
  const process = input.process ?? {};
  const automatic = input.mode === "automatic";
  const storedFields = input.schema.fields.filter((field) => field.handling !== "exclude").map((field) => field.id);
  const wholeRow = process.columns ?? storedFields;
  const identityKey = process.dedupe === false ? undefined : process.dedupe?.by ?? wholeRow;

  // Each row as the filters, dedupe and sort read it: its stored values and its derived columns (header).
  const derive = process.derive ?? [];
  const working = derive.length === 0 ? input.rows : input.rows.map((row) => ({ ...row, values: automationStudioRecordDerivedValues(row.values, derive, input.now) }));
  const stored = new Map<AutomationStudioRecordCollectedRow, AutomationStudioRecordCollectedRow>(working.map((row, index) => [row, input.rows[index]!]));
  const positions = new Map<string, number>();
  const sources = new Map(working.map((row) => {
    const batch = JSON.stringify([row.nodeId, row.batchKey]);
    const position = positions.get(batch) ?? 0;
    positions.set(batch, position + 1);
    return [row, { nodeId: row.nodeId, batchKey: row.batchKey, row: position }] as const;
  }));

  const where = process.where ?? [];
  const groups = process.anyOf ?? [];
  const comparisons = process.compare ?? [];
  // Every filter in order: the `where` conditions, then the groups, then the comparisons (header).
  const filters = automationStudioRecordProcessingFilterChecks(process, input.now, automatic);
  // A captured field the item does not show is a definite value, never missing evidence (t993, `not-shown.ts`).
  const notShown = (row: AutomationStudioRecordCollectedRow, field: string): boolean => automatic && automationStudioRecordNotShown(row.values, row.captured, field, derive);
  const readings = working.map((row) => filters.map((check) => check(row.values, (field) => notShown(row, field))));
  // Which filters each row fails, by position: a row failing none is in the answer's running.
  const failed = readings.map((row) => row.flatMap((reading, index) => reading.holds ? [] : [index]));
  if (automatic) {
    const missingEvidence = readings.flatMap((row, at): AutomationStudioRecordProcessingMissingEvidence[] => {
      // A known false conjunct already excludes this occurrence; unknowns cannot change that.
      if (row.some((reading) => !reading.holds && reading.missing.length === 0)) return [];
      return row.flatMap((reading) => reading.missing.map((issue) => ({ ...issue, source: sources.get(working[at]!)! })));
    });
    if (missingEvidence.length) return { state: "missing-evidence", missingEvidence };
  }
  const matching = working.filter((_row, index) => failed[index]!.length === 0);

  const primaryKey = input.schema.primaryKey;
  const automaticKey = process.dedupe === false ? [] : process.dedupe?.by ??
    (primaryKey?.length && primaryKey.every((field) => storedFields.includes(field)) ? primaryKey : []);
  const identityOf = (row: AutomationStudioRecordCollectedRow): string | undefined => automatic
    ? automationStudioRecordAutomaticIdentity(row.values, stored.get(row)!.values, automaticKey, storedFields)
    : automationStudioRecordRowIdentity(row.values, identityKey ?? wholeRow);
  const seen = new Set<string>();
  const distinct = identityKey === undefined ? matching : matching.filter((row) => {
    const identity = identityOf(row);
    if (identity === undefined) return true;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });

  if (automatic) {
    const missingEvidence = (process.sort ?? []).flatMap((key, index): AutomationStudioRecordProcessingMissingEvidence[] => {
      const kind = key.as === undefined || key.as === "auto" ? automationStudioRecordAutoSortKind(distinct.map((row) => cellOf(row.values, key.field)), input.now) : key.as;
      return distinct.flatMap((row) => {
        // A value the item does not show sorts after every value read, as the sort places it.
        if (notShown(row, key.field)) return [];
        const reason = automationStudioRecordRequiredValueIssue(cellOf(row.values, key.field), kind, input.now);
        const derived = derive.find((field) => field.id === key.field);
        return reason ? [{ operator: "sort" as const, index, field: key.field, ...(derived ? { from: derived.from } : {}), reason, source: sources.get(row)! }] : [];
      });
    });
    if (missingEvidence.length) return { state: "missing-evidence", missingEvidence };
  }
  const sorted = sortAutomationStudioRecordRows(distinct, process.sort ?? [], input.now);
  const limited = process.limit === undefined ? sorted : sorted.slice(0, process.limit);
  if (automatic) {
    const missingEvidence = (process.columns ?? []).flatMap((field, index): AutomationStudioRecordProcessingMissingEvidence[] => limited.flatMap((row) => {
      // A column the item does not show is an empty cell of the answer.
      if (notShown(stored.get(row)!, field)) return [];
      const reason = automationStudioRecordRequiredValueIssue(cellOf(stored.get(row)!.values, field), "value", input.now);
      return reason ? [{ operator: "columns" as const, index, field, reason, source: sources.get(row)! }] : [];
    }));
    if (missingEvidence.length) return { state: "missing-evidence", missingEvidence };
  }
  const retainedRows = limited.map((row) => retainedRow(stored.get(row)!.values, storedFields));
  const rows = retainedRows.map((row) => answerRow(row, process.columns));

  const account: AutomationStudioRecordProcessingAccount = {
    collected: input.rows.length,
    duplicates: matching.length - distinct.length,
    filteredOut: input.rows.length - matching.length,
    cut: sorted.length - limited.length,
    kept: rows.length,
    passes: passesOf(working, process.dedupe === false || process.dedupe === undefined ? wholeRow : process.dedupe.by, automatic ? identityOf : undefined)
  };
  const labelFields = process.columns ?? storedFields;
  if (where.length) account.conditions = conditionAccounts(where, working, failed, labelFields, input.now);
  const otherFilters = [
    ...groups.map((group): FilterOf => ({ kind: "any_of", fields: automationStudioRecordAnyOfFields(group), condition: automationStudioRecordAnyOfText(group) })),
    ...comparisons.map((comparison): FilterOf => ({ kind: "compare", fields: automationStudioRecordFieldComparisonFields(comparison), condition: automationStudioRecordFieldComparisonText(comparison) }))
  ];
  if (otherFilters.length) account.filters = filterAccounts(otherFilters, where.length, working, failed, labelFields);
  const hiddenSortKeys = hiddenSortKeysOf(process.sort ?? [], process.columns, distinct, limited, input.now);
  if (hiddenSortKeys.length) account.hiddenSortKeys = hiddenSortKeys;
  if (rows.length === 0) account.keptNone = true;
  const minRows = process.minRows ?? AUTOMATION_STUDIO_RECORD_PROCESSING_LIMITS.minRowsDefault;
  if (rows.length < minRows) account.belowMinRows = minRows;
  if (!automatic) return { rows, retainedRows, account };
  return rows.length || process.minRows === 0 ? { state: "ready", rows, retainedRows, account } : { state: "empty", reason: input.rows.length ? "no_matches" : "uncollected", account };
}

/** Each condition's rejected and alone counts, and the rows it alone left out, each label once, in capture order (header). */
function conditionAccounts(
  where: readonly AutomationStudioRecordCondition[],
  rows: readonly AutomationStudioRecordCollectedRow[],
  failed: readonly (readonly number[])[],
  labelFields: readonly string[],
  now: number
): AutomationStudioRecordProcessingConditionAccount[] {
  return where.map((condition, index) => {
    const account: AutomationStudioRecordProcessingConditionAccount = { field: condition.field, condition: automationStudioRecordConditionText(condition), rejected: 0, alone: 0, leftOutOnlyByThis: [] };
    const evaluated = parseAutomationStudioRecordCondition(condition);
    if (evaluated && Number.isFinite(now)) account.evaluation = { condition: evaluated, now };
    // One label can name several captures. Only identical tested readings on
    // the same label column may share a witness, including captures kept by
    // another condition. Never silently keep the first conflicting reading.
    const witnessed = new Map<string, { field: string; tested: AutomationStudioRecordProcessingTestedValue }>();
    for (const row of rows) {
      const label = labelOf(row.values, labelFields);
      if (!label) continue;
      const tested = testedValue(condition, cellOf(row.values, condition.field), now);
      const previous = witnessed.get(label.label);
      witnessed.set(label.label, previous && (previous.field !== label.field || JSON.stringify(previous.tested) !== JSON.stringify(tested))
        ? { field: label.field, tested: { state: "unavailable" } }
        : { field: label.field, tested });
    }
    const named = new Set<string>();
    const dated = automationStudioRecordConditionComparesDates(condition);
    let undated = 0;
    rows.forEach((row, at) => {
      const fails = failed[at]!;
      if (!fails.includes(index)) return;
      account.rejected += 1;
      if (dated && undatedCell(cellOf(row.values, condition.field), now)) undated += 1;
      if (fails.length !== 1) return;
      account.alone += 1;
      const label = labelOf(row.values, labelFields);
      if (label === undefined || named.has(label.label)) return;
      named.add(label.label);
      account.leftOutOnlyByThis.push({ ...label, tested: witnessed.get(label.label)!.tested });
    });
    if (undated > 0) account.undated = undated;
    return account;
  });
}

/** What an `anyOf` group or a `compare` is said as on the account. */
type FilterOf = Pick<AutomationStudioRecordProcessingFilterAccount, "kind" | "fields" | "condition">;

/**
 * Each group's or comparison's rejected and alone counts, and the rows it alone
 * left out, each label once, in capture order, as `conditionAccounts` counts a
 * condition's; `offset` is where the first of them sits among every filter.
 */
function filterAccounts(
  said: readonly FilterOf[],
  offset: number,
  rows: readonly AutomationStudioRecordCollectedRow[],
  failed: readonly (readonly number[])[],
  labelFields: readonly string[]
): AutomationStudioRecordProcessingFilterAccount[] {
  return said.map((filter, at) => {
    const index = offset + at;
    const account: AutomationStudioRecordProcessingFilterAccount = { ...filter, rejected: 0, alone: 0, leftOutOnlyByThis: [] };
    const named = new Set<string>();
    rows.forEach((row, position) => {
      const fails = failed[position]!;
      if (!fails.includes(index)) return;
      account.rejected += 1;
      if (fails.length !== 1) return;
      account.alone += 1;
      const label = labelOf(row.values, labelFields);
      if (label === undefined || named.has(label.label)) return;
      named.add(label.label);
      account.leftOutOnlyByThis.push(label);
    });
    return account;
  });
}

/** A primitive's actual reading. Unsupported values and lossy numeric text are not negative evidence. */
function testedValue(condition: AutomationStudioRecordCondition, cell: unknown, now: number): AutomationStudioRecordProcessingTestedValue {
  if (cell === undefined || cell === null || (typeof cell === "string" && !cell.trim())) return { state: "absent" };
  if (typeof cell !== "string" && typeof cell !== "boolean" && (typeof cell !== "number" || !Number.isFinite(cell))) return { state: "unavailable" };
  const value = String(cell);
  if (["[withheld]", "(withheld)", "(no value)"].includes(value)) return { state: "unavailable" };
  // The numeric evaluator uses the original number; a value such as 1e21
  // must not be witnessed as the different number its textual reader finds.
  if (automationStudioRecordConditionHolds(condition, cell, now) !== automationStudioRecordConditionHolds(condition, value, now)) return { state: "unavailable" };
  return { state: "present", value };
}

/** Whether a cell states no date a date bound can read, a missing value included (header, t790). */
function undatedCell(cell: unknown, now: number): boolean {
  const text = cellText(cell);
  return text === undefined || readAutomationStudioRecordConditionDate(text, now) === undefined;
}

/** A row's label: its first stored column, in schema order, holding text -- the column a stored row is labelled by where it is judged. */
function labelOf(values: Readonly<Record<string, unknown>>, fields: readonly string[]): { field: string; label: string } | undefined {
  for (const field of fields) {
    const cell = cellOf(values, field);
    if (typeof cell === "string" && cell.trim()) return { field, label: cell };
  }
  return undefined;
}

/**
 * Each sort key `columns` leave out, read as the sort read it: its kind decided
 * over the rows it sorted (`sort-rows.ts`), its values on the answer's rows in
 * answer order (header).
 */
function hiddenSortKeysOf(
  keys: readonly AutomationStudioRecordSortKey[],
  columns: readonly string[] | undefined,
  sorted: readonly AutomationStudioRecordCollectedRow[],
  answer: readonly AutomationStudioRecordCollectedRow[],
  now: number
): AutomationStudioRecordProcessingHiddenSortKey[] {
  if (columns === undefined) return [];
  return keys.flatMap((key, position): AutomationStudioRecordProcessingHiddenSortKey[] => {
    if (columns.includes(key.field)) return [];
    const kind = key.as === undefined || key.as === "auto" ? automationStudioRecordAutoSortKind(sorted.map((row) => cellOf(row.values, key.field)), now) : key.as;
    const values = answer.map((row) => readAutomationStudioRecordSortValue(cellOf(row.values, key.field), kind, now));
    const read = values.filter((value) => value !== undefined).length;
    return [{
      field: key.field,
      position,
      order: key.order,
      kind,
      read,
      ...(position === 0 ? { inOrder: inKeyOrder(values, key.order) } : {}),
      ...(kind === "text" ? {} : { readings: values.slice(0, HIDDEN_SORT_READINGS).map((value) => (typeof value === "number" ? value : null)) })
    }];
  });
}

/** Whether `values` run in `order`, every unread value after every read one. */
function inKeyOrder(values: ReadonlyArray<number | string | undefined>, order: AutomationStudioRecordSortKey["order"]): boolean {
  for (let index = 1; index < values.length; index += 1) {
    const before = values[index - 1];
    const after = values[index];
    if (after === undefined) continue;
    if (before === undefined) return false;
    const compared = typeof before === "number" && typeof after === "number" ? before - after : ORDER_COLLATOR.compare(String(before), String(after));
    if (order === "desc" ? compared < 0 : compared > 0) return false;
  }
  return true;
}

/** Keeps opaque source metadata through selection without admitting any extra string-keyed data. */
function retainedRow(values: Readonly<Record<string, unknown>>, fields: readonly string[]): Record<string, unknown> {
  const row = answerRow(values, fields);
  for (const symbol of Object.getOwnPropertySymbols(values)) {
    if (!Object.prototype.propertyIsEnumerable.call(values, symbol)) continue;
    Object.defineProperty(row, symbol, { value: Reflect.get(values, symbol), enumerable: true, writable: true, configurable: true });
  }
  return row;
}

function answerRow(values: Readonly<Record<string, unknown>>, columns: readonly string[] | undefined): Record<string, unknown> {
  if (columns === undefined) return { ...values };
  const row: Record<string, unknown> = {};
  for (const column of columns) {
    if (Object.prototype.hasOwnProperty.call(values, column)) row[column] = values[column];
  }
  return row;
}

/**
 * Batches in first-appearance order, numbered per node, each with the rows it
 * added that no earlier collected row already had under `key`. The count is
 * over every collected row, before `where`, since it measures what a pass
 * brought rather than what the answer kept.
 */
function passesOf(rows: readonly AutomationStudioRecordCollectedRow[], key: readonly string[], identityOf?: (row: AutomationStudioRecordCollectedRow) => string | undefined): AutomationStudioRecordProcessingPass[] {
  const passes: AutomationStudioRecordProcessingPass[] = [];
  const byBatch = new Map<string, AutomationStudioRecordProcessingPass>();
  const perNode = new Map<string, number>();
  const seen = new Set<string>();
  for (const row of rows) {
    const batch = JSON.stringify([row.nodeId, row.batchKey]);
    let pass = byBatch.get(batch);
    if (pass === undefined) {
      const number = (perNode.get(row.nodeId) ?? 0) + 1;
      perNode.set(row.nodeId, number);
      pass = { node: row.nodeId, pass: number, rows: 0, newRows: 0 };
      byBatch.set(batch, pass);
      passes.push(pass);
    }
    pass.rows += 1;
    const identity = identityOf === undefined ? automationStudioRecordRowIdentity(row.values, key) : identityOf(row);
    if (identity === undefined || !seen.has(identity)) pass.newRows += 1;
    if (identity !== undefined) seen.add(identity);
  }
  return passes;
}
