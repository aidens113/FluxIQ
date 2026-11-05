// What an attempt found, whichever way it ended. A budget-out result is this same
// record, kind `partial` or `rows`, with what it got (plan, D8): there is no second
// shape for a bad ending.
//
// **Two questions stay separate (D4).** `label` says whether this answer is right.
// Whether the Flow does the task is on `./saved-state.ts`.
//
// **What a result may carry.** No page address, no token, and no page text, with two
// named exceptions a person asked for: `rows.previewRows` holds rows real reads
// stored, because they are the result itself, under the stored schema so a field
// excluded from storage never appears; and `answerText` holds the model's words,
// labelled as such. Everything else is a person's words checked by
// `./person-words.ts`, or a count.

import { AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS, AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS } from "../record-sets/index.ts";
import type { JsonObject, JsonValue } from "../core.ts";
import { parseAutomationStudioAttemptAct, type AutomationStudioAttemptAct } from "./attempt-act.ts";
import { hasOnlyKeys, isCount, isId, isMemberOf, isPlainRecord } from "./field-checks.ts";
import { parseTotally } from "./parse-totally.ts";
import { AUTOMATION_STUDIO_TASK_ATTEMPT_LIMITS as LIMITS } from "./limits.ts";
import { isPersonWords } from "./person-words.ts";

/**
 * - `rows`: rows a real read stored, a count and an export.
 * - `done_on_site`: lasting acts, told from Core's act record and never the model's prose.
 * - `plain_answer`: a sentence in the model's words.
 * - `partial`: what it got and what is missing. It may hold nothing at all, when a
 *   budget ran out before anything was found.
 */
export const AUTOMATION_STUDIO_TASK_RESULT_KINDS = Object.freeze(["rows", "done_on_site", "plain_answer", "partial"] as const);

export type AutomationStudioTaskResultKind = (typeof AUTOMATION_STUDIO_TASK_RESULT_KINDS)[number];

/**
 * Core's verdict words on a result. `confirmed` and `refuted` each need a check to
 * have run. `unverified` says it was not settled, and a person is asked to look.
 * Core's `no_result` is not here: a task with no result has no result record.
 */
export const AUTOMATION_STUDIO_TASK_RESULT_LABELS = Object.freeze(["confirmed", "refuted", "unverified"] as const);

export type AutomationStudioTaskResultLabel = (typeof AUTOMATION_STUDIO_TASK_RESULT_LABELS)[number];

/** Whether the result came from the saved Flow, from exploration, or from a run exploration carried on from. */
export const AUTOMATION_STUDIO_TASK_RESULT_SOURCES = Object.freeze(["flow", "exploration", "both"] as const);

export type AutomationStudioTaskResultSource = (typeof AUTOMATION_STUDIO_TASK_RESULT_SOURCES)[number];

export type AutomationStudioTaskResultColumn = { id: string; label: string };

/**
 * Rows the attempt read, by reference to the run dataset that stores them. A model
 * never writes a row: there is no way to put rows here except from a stored dataset,
 * which is why `runId` and `datasetId` are required.
 */
export type AutomationStudioTaskResultRows = {
  runId: string;
  datasetId: string;
  totalRows: number;
  /** True when rows past the dataset's cap were dropped, so `totalRows` is not all there was. */
  truncated: boolean;
  columns: AutomationStudioTaskResultColumn[];
  /** The first rows, keyed by column id. At most `previewMaxRows`, and at most `totalRows`. */
  previewRows: JsonObject[];
};

/** Where it came from, in words: "3 results pages" on "shop.example". */
export type AutomationStudioTaskResultFrom = {
  /** A host name, never a full address. */
  site: string;
  pages: string;
};

export type AutomationStudioTaskResult = {
  attemptId: string;
  kind: AutomationStudioTaskResultKind;
  label: AutomationStudioTaskResultLabel;
  /** How many checks ran. One says it was checked once: one yes once finished a build on wrong rows (t296). */
  timesChecked: number;
  source: AutomationStudioTaskResultSource;
  rows?: AutomationStudioTaskResultRows;
  /** Every lasting act of the attempt. Empty says nothing changed on the site. */
  acts: AutomationStudioAttemptAct[];
  /** A plain answer, labelled as the model's words wherever it goes. Bounded, and otherwise unchecked: screening it is the writer's job. */
  answerText?: { text: string; author: "model" };
  /** What was checked, in a person's words. */
  checkedWhat?: string;
  /** What is missing from a partial result, in a person's words. */
  missingWhat?: string;
  /** How many rows the act record held as already done, so the attempt left them alone: a whole number of at least 1, absent when there were none, so a person can see a row was skipped. */
  skippedAsDone?: number;
  from?: AutomationStudioTaskResultFrom[];
};

export type AutomationStudioTaskResultParseResult =
  | { ok: true; result: AutomationStudioTaskResult }
  | { ok: false; issues: string[] };

const RESULT_KEYS: ReadonlySet<string> = new Set(["attemptId", "kind", "label", "timesChecked", "source", "rows", "acts", "answerText", "checkedWhat", "missingWhat", "skippedAsDone", "from"]);
const ROWS_KEYS: ReadonlySet<string> = new Set(["runId", "datasetId", "totalRows", "truncated", "columns", "previewRows"]);
const COLUMN_KEYS: ReadonlySet<string> = new Set(["id", "label"]);
const ANSWER_KEYS: ReadonlySet<string> = new Set(["text", "author"]);
const FROM_KEYS: ReadonlySet<string> = new Set(["site", "pages"]);
const RESERVED_COLUMNS: ReadonlySet<string> = new Set(AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.reservedFieldIds);
const HOST = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*$/u;

/**
 * Parses an untrusted value into a result, returning fresh objects. Exact fields: an
 * unknown key, kind, label or source is refused. Also refused: `confirmed` or
 * `refuted` with no check, `rows` with no rows, `plain_answer` with no answer, and
 * `done_on_site` with no act that happened. Issues are stable codes prefixed
 * `task_result.`, each listed once; a nested act's issues keep their
 * `attempt_act.` codes.
 */
export function parseAutomationStudioTaskResult(value: unknown): AutomationStudioTaskResultParseResult {
  const parsed = parseTotally("task_result", (issues) => readResult(value, issues));
  return parsed.ok ? { ok: true, result: parsed.value } : parsed;
}

function readResult(value: unknown, issues: Set<string>): AutomationStudioTaskResult | null {
  if (!isPlainRecord(value)) {
    issues.add("task_result.not_object");
    return null;
  }
  if (!hasOnlyKeys(value, RESULT_KEYS)) issues.add("task_result.unknown_key");
  const { attemptId, kind, label, timesChecked, source, checkedWhat, missingWhat } = value;
  const rows = value.rows === undefined ? undefined : readRows(value.rows, issues);
  const acts = readActs(value.acts, issues);
  const answerText = value.answerText === undefined ? undefined : readAnswer(value.answerText);
  const from = value.from === undefined ? undefined : readFrom(value.from);
  if (!isId(attemptId)) issues.add("task_result.invalid_attempt_id");
  if (!isMemberOf(AUTOMATION_STUDIO_TASK_RESULT_KINDS, kind)) issues.add("task_result.invalid_kind");
  if (!isMemberOf(AUTOMATION_STUDIO_TASK_RESULT_LABELS, label)) issues.add("task_result.invalid_label");
  if (!isCount(timesChecked)) issues.add("task_result.invalid_times_checked");
  if (!isMemberOf(AUTOMATION_STUDIO_TASK_RESULT_SOURCES, source)) issues.add("task_result.invalid_source");
  if (answerText === null) issues.add("task_result.invalid_answer_text");
  if (checkedWhat !== undefined && !isPersonWords(checkedWhat)) issues.add("task_result.invalid_checked_what");
  if (missingWhat !== undefined && !isPersonWords(missingWhat)) issues.add("task_result.invalid_missing_what");
  if (value.skippedAsDone !== undefined && !isSkippedCount(value.skippedAsDone)) issues.add("task_result.invalid_skipped_as_done");
  if (from === null) issues.add("task_result.invalid_from");
  if ((label === "confirmed" || label === "refuted") && timesChecked === 0) issues.add("task_result.label_needs_a_check");
  if (kind === "rows" && value.rows === undefined) issues.add("task_result.rows_kind_needs_rows");
  if (kind === "plain_answer" && value.answerText === undefined) issues.add("task_result.plain_answer_needs_answer");
  if (kind === "done_on_site" && acts !== null && !acts.some((act) => act.state === "landed" || act.state === "may_have_landed")) issues.add("task_result.done_on_site_needs_an_act");
  if (issues.size > 0) return null;
  if (!isId(attemptId) || !isMemberOf(AUTOMATION_STUDIO_TASK_RESULT_KINDS, kind) || !isMemberOf(AUTOMATION_STUDIO_TASK_RESULT_LABELS, label) || !isCount(timesChecked) || !isMemberOf(AUTOMATION_STUDIO_TASK_RESULT_SOURCES, source)) return null;
  if (acts === null || rows === null || answerText === null || from === null) return null;
  const result: AutomationStudioTaskResult = { attemptId, kind, label, timesChecked, source, acts };
  if (rows !== undefined) result.rows = rows;
  if (answerText !== undefined) result.answerText = answerText;
  if (typeof checkedWhat === "string") result.checkedWhat = checkedWhat;
  if (typeof missingWhat === "string") result.missingWhat = missingWhat;
  if (isSkippedCount(value.skippedAsDone)) result.skippedAsDone = value.skippedAsDone;
  if (from !== undefined) result.from = from;
  return result;
}

/** A count of skipped rows: whole, and at least one, because a result with none says nothing. */
function isSkippedCount(value: unknown): value is number {
  return isCount(value) && value >= 1;
}

function readActs(value: unknown, issues: Set<string>): AutomationStudioAttemptAct[] | null {
  if (!Array.isArray(value) || value.length > LIMITS.listMaxEntries) {
    issues.add("task_result.invalid_acts");
    return null;
  }
  const acts: AutomationStudioAttemptAct[] = [];
  for (const item of value) {
    const parsed = parseAutomationStudioAttemptAct(item);
    if (parsed.ok) acts.push(parsed.act);
    else for (const issue of parsed.issues) issues.add(issue);
  }
  return acts.length === value.length ? acts : null;
}

function readAnswer(value: unknown): { text: string; author: "model" } | null {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ANSWER_KEYS) || value.author !== "model") return null;
  const { text } = value;
  if (typeof text !== "string" || text.trim().length === 0 || text.length > LIMITS.answerMaxLength) return null;
  return { text, author: "model" };
}

function readFrom(value: unknown): AutomationStudioTaskResultFrom[] | null {
  if (!Array.isArray(value) || value.length > LIMITS.listMaxEntries) return null;
  const from: AutomationStudioTaskResultFrom[] = [];
  for (const item of value) {
    if (!isPlainRecord(item) || !hasOnlyKeys(item, FROM_KEYS)) return null;
    const { site, pages } = item;
    if (typeof site !== "string" || !HOST.test(site) || !isPersonWords(pages)) return null;
    from.push({ site, pages });
  }
  return from;
}

function readRows(value: unknown, issues: Set<string>): AutomationStudioTaskResultRows | null {
  if (!isPlainRecord(value)) {
    issues.add("task_result.invalid_rows");
    return null;
  }
  if (!hasOnlyKeys(value, ROWS_KEYS)) issues.add("task_result.unknown_key");
  const { runId, datasetId, totalRows, truncated } = value;
  const columns = readColumns(value.columns);
  const previewRows = columns === null ? null : readPreview(value.previewRows, new Set(columns.map((column) => column.id)));
  if (!isId(runId)) issues.add("task_result.invalid_rows_run_id");
  if (typeof datasetId !== "string" || datasetId === "." || datasetId === ".." || !AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.datasetIdPattern.test(datasetId)) issues.add("task_result.invalid_rows_dataset_id");
  if (!isCount(totalRows)) issues.add("task_result.invalid_total_rows");
  if (typeof truncated !== "boolean") issues.add("task_result.invalid_truncated");
  if (columns === null) issues.add("task_result.invalid_columns");
  if (previewRows === null) issues.add("task_result.invalid_preview_rows");
  else if (isCount(totalRows) && previewRows.length > totalRows) issues.add("task_result.preview_past_total");
  if (!isId(runId) || typeof datasetId !== "string" || !isCount(totalRows) || typeof truncated !== "boolean" || columns === null || previewRows === null) return null;
  return { runId, datasetId, totalRows, truncated, columns, previewRows };
}

function readColumns(value: unknown): AutomationStudioTaskResultColumn[] | null {
  if (!Array.isArray(value) || value.length > AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.maxFields) return null;
  const seen = new Set<string>();
  const columns: AutomationStudioTaskResultColumn[] = [];
  for (const item of value) {
    if (!isPlainRecord(item) || !hasOnlyKeys(item, COLUMN_KEYS)) return null;
    const { id, label } = item;
    if (typeof id !== "string" || !AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.fieldIdPattern.test(id) || RESERVED_COLUMNS.has(id) || seen.has(id)) return null;
    if (typeof label !== "string" || label.trim().length === 0 || label.length > AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.labelMaxLength) return null;
    seen.add(id);
    columns.push({ id, label });
  }
  return columns;
}

function readPreview(value: unknown, columns: ReadonlySet<string>): JsonObject[] | null {
  if (!Array.isArray(value) || value.length > LIMITS.previewMaxRows) return null;
  const rows: JsonObject[] = [];
  for (const item of value) {
    if (!isPlainRecord(item) || !hasOnlyKeys(item, columns)) return null;
    const row = copyCell(item, 0);
    if (row === undefined) return null;
    rows.push(row as JsonObject);
  }
  if (new TextEncoder().encode(JSON.stringify(rows)).length > LIMITS.previewMaxBytes) return null;
  return rows;
}

/** A fresh copy of a JSON value, or undefined for anything JSON cannot hold or a value past the depth bound. */
function copyCell(value: unknown, depth: number): JsonValue | undefined {
  if (depth > LIMITS.previewCellMaxDepth) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    const copied = value.map((item) => copyCell(item, depth + 1));
    return copied.every((item) => item !== undefined) ? copied as JsonValue[] : undefined;
  }
  if (!isPlainRecord(value)) return undefined;
  const copied = new Map<string, JsonValue>();
  for (const [key, member] of Object.entries(value)) {
    const cell = copyCell(member, depth + 1);
    if (cell === undefined) return undefined;
    copied.set(key, cell);
  }
  return Object.fromEntries(copied);
}
