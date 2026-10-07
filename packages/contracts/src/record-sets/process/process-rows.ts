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

import { cellOf } from "./cell-text.ts";
import { automationStudioRecordConditionHolds } from "./condition-holds.ts";
import { AUTOMATION_STUDIO_RECORD_PROCESSING_LIMITS } from "./processing-vocabulary.ts";
import { automationStudioRecordRowIdentity } from "./row-identity.ts";
import { sortAutomationStudioRecordRows } from "./sort-rows.ts";
import type { AutomationStudioRecordSchema } from "../schema.ts";
import type { AutomationStudioRecordProcessing, AutomationStudioRecordProcessingAccount, AutomationStudioRecordProcessingPass } from "./types.ts";

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
  const matching = input.rows.filter((row) => where.every((condition) => automationStudioRecordConditionHolds(condition, cellOf(row.values, condition.field))));

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
  if (rows.length === 0) account.keptNone = true;
  const minRows = process.minRows ?? AUTOMATION_STUDIO_RECORD_PROCESSING_LIMITS.minRowsDefault;
  if (rows.length < minRows) account.belowMinRows = minRows;
  return { rows, account };
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
