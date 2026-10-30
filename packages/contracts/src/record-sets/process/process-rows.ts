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

import { cellOf, cellText } from "./cell-text.ts";
import { automationStudioRecordConditionComparesDates } from "./compares-dates.ts";
import { automationStudioRecordConditionHolds, automationStudioRecordConditionText } from "./condition/index.ts";
import { AUTOMATION_STUDIO_RECORD_PROCESSING_LIMITS } from "./processing-vocabulary.ts";
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
  AutomationStudioRecordProcessingHiddenSortKey,
  AutomationStudioRecordProcessingPass,
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
};

export type AutomationStudioRecordProcessRowsInput = {
  /** In capture order: pass order, then page order within a pass. */
  rows: readonly AutomationStudioRecordCollectedRow[];
  /** The record output's schema; `exclude` fields are not stored and never part of the default key. */
  schema: AutomationStudioRecordSchema;
  process?: AutomationStudioRecordProcessing;
  /** Epoch milliseconds that relative dates ("3 days ago") are measured back from. */
  now: number;
};

export type AutomationStudioRecordProcessRowsResult = {
  /** The answer, as fresh objects in answer order. */
  rows: Record<string, unknown>[];
  account: AutomationStudioRecordProcessingAccount;
};

/** The answer and its account. Leaves the input unmodified. */
export function processAutomationStudioRecordRows(input: AutomationStudioRecordProcessRowsInput): AutomationStudioRecordProcessRowsResult {
  const process = input.process ?? {};
  const stored = input.schema.fields.filter((field) => field.handling !== "exclude").map((field) => field.id);
  const wholeRow = process.columns ?? stored;
  const identityKey = process.dedupe === false ? undefined : process.dedupe?.by ?? wholeRow;

  const where = process.where ?? [];
  // Which conditions each row fails, by position: a row failing none is in the answer's running.
  const failed = input.rows.map((row) => where.flatMap((condition, index) => automationStudioRecordConditionHolds(condition, cellOf(row.values, condition.field), input.now) ? [] : [index]));
  const matching = input.rows.filter((_row, index) => failed[index]!.length === 0);

  const seen = new Set<string>();
  const distinct = identityKey === undefined ? matching : matching.filter((row) => {
    const identity = automationStudioRecordRowIdentity(row.values, identityKey);
    if (identity === undefined) return true;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });

  const sorted = sortAutomationStudioRecordRows(distinct, process.sort ?? [], input.now);
  const limited = process.limit === undefined ? sorted : sorted.slice(0, process.limit);
  const rows = limited.map((row) => answerRow(row.values, process.columns));

  const account: AutomationStudioRecordProcessingAccount = {
    collected: input.rows.length,
    duplicates: matching.length - distinct.length,
    filteredOut: input.rows.length - matching.length,
    cut: sorted.length - limited.length,
    kept: rows.length,
    passes: passesOf(input.rows, process.dedupe === false || process.dedupe === undefined ? wholeRow : process.dedupe.by)
  };
  if (where.length) account.conditions = conditionAccounts(where, input.rows, failed, (process.columns ?? stored), input.now);
  const hiddenSortKeys = hiddenSortKeysOf(process.sort ?? [], process.columns, distinct, limited, input.now);
  if (hiddenSortKeys.length) account.hiddenSortKeys = hiddenSortKeys;
  if (rows.length === 0) account.keptNone = true;
  const minRows = process.minRows ?? AUTOMATION_STUDIO_RECORD_PROCESSING_LIMITS.minRowsDefault;
  if (rows.length < minRows) account.belowMinRows = minRows;
  return { rows, account };
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
      account.leftOutOnlyByThis.push(label);
    });
    if (undated > 0) account.undated = undated;
    return account;
  });
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
function passesOf(rows: readonly AutomationStudioRecordCollectedRow[], key: readonly string[]): AutomationStudioRecordProcessingPass[] {
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
    const identity = automationStudioRecordRowIdentity(row.values, key);
    if (identity === undefined || !seen.has(identity)) pass.newRows += 1;
    if (identity !== undefined) seen.add(identity);
  }
  return passes;
}
