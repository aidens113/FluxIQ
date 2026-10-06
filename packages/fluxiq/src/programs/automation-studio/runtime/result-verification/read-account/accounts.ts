// How each list read of a run went, joined from the read's own account of
// itself and the parameters the Flow authored the step with.
//
// **The counts are already on the run record.** A read answers with a summary
// of itself -- pages read, why paging stopped, items seen, rows kept, what each
// `where` condition rejected -- and `service/summaries/extraction-summary.ts`
// admits it member by member onto the attempt as `metadata.extraction`. It is
// re-read here only for the members this account carries, each held to the
// type that module already enforced, so a record written before a member
// existed simply lacks it.
//
// **The rest is what the step was authored with.** Whether it pages, how many
// pages it may read, whether it keeps one row per key and which, and each
// condition in the model's own words (`condition.ts`). The read's parameters sit
// either at the top of the step's parameters or one object down, under the key
// the domain's definition gives them; that key is the domain's to name, so it is
// found by what the object holds -- a condition list, a paging setting, a dedupe
// setting, a column map -- rather than by its name.
//
// **A dedupe is read in every form the domain reads one** (`dedupe.ts`), and a
// read that moves page by page is said to leave out a row identical to one an
// earlier page yielded, with the read's own count where it sent one
// (`earlierPageRepeats`). Live run `run-muqk713g`'s judges were all told the
// earbuds read "does not deduplicate": 12 rows passed its conditions, 10 were
// stored, the other two such repeats, and each judge asked for a dedupe.
//
// A condition is paired with its rejection count by position: the read reports
// one count per condition it was given, in the order it was given them.
//
// **And the rows each condition removed by itself, by label** (`alone-rows.ts`),
// carried, like the wording, only under the bound domain's declared keys. Each
// with the value the condition tested (t195-w34): the stored row holds every
// column, its label first (`service/summaries/extraction-summary.ts`), and is
// cut here to its label and the cell of the column the condition tests
// (`condition.ts`), the two-cell shape the build-test's rows arrive in. A row
// stored before then holds its label alone and is said as before.
//
// **Whether a condition tested the label is said here, from structure**
// (`testedLabel`): its left-out rows exist and each is labelled by the very
// column the authored condition tests. A row said by its label alone cannot
// say it: live run `run-mux6naez-6c20f26e` stored name, price, rating and url,
// so its `plus is present` and `sponsored is absent` rows, their columns not
// stored, came by label alone, and `../request-rows/` took them as tests of
// the name.
//
// **Every read, every condition and every dedupe key** (user, 2026-09-30:
// "Remove ANY AND ALL LIMITS ON THE NUMBER OF ELEMENTS PASSED TO MODEL. DO NOT
// HIDE INFORMATION"). Until then a judge saw four reads, eight conditions each
// and six dedupe keys, and was told only that more had been left out.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS } from "@fluxiq/contracts/automation-studio";
import type { AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../model/index.ts";
import { automationStudioEvidenceKey } from "../../llm/index.ts";
import type { AutomationStudioResultReadAccount } from "../contracts.ts";
import { automationStudioResultReadAloneRows } from "./alone-rows.ts";
import { automationStudioResultReadConditionColumn, automationStudioResultReadConditionText } from "./condition.ts";
import { automationStudioResultReadDedupe } from "./dedupe.ts";

/** The members that mark an object as a read's own parameters. */
const READ_PARAMETER_KEYS = ["where", "paginate", "dedupe", "fields"];
/** A closed word the read reports, as extraction-summary.ts admits them. */
const STOP_WORD = /^[a-z_]{1,40}$/u;
/** The paging modes that move to another page, lower-cased. */
const PAGE_BY_PAGE_MODES: ReadonlySet<string> = new Set(["next", "numbered"]);
/** A key a JavaScript object orders first whatever order it was written in, so never a row's second cell: it would read as the label. */
const INDEX_KEY = /^\d+$/u;

export type AutomationStudioResultReadAccountsInput = {
  /** The run's recorded attempts, in the order they ran. */
  actionAttempts?: readonly AutomationStudioFlowRunActionAttemptRecord[] | undefined;
  /** The Flow's authored nodes, for what each read step was authored with. */
  flowNodes?: readonly AutomationStudioFlowNode[] | undefined;
  /** The bound domain's declared keys. Absent, nothing authored is carried: only counts. */
  deniedEvidenceKeys?: readonly string[] | undefined;
};

/** One account per step that reported a read, in the order each first read: every one of them. */
export function automationStudioResultReadAccounts(input: AutomationStudioResultReadAccountsInput): { reads: AutomationStudioResultReadAccount[] } {
  const latest = new Map<string, { attempt: AutomationStudioFlowRunActionAttemptRecord; extraction: JsonObject; attempts: number }>();
  for (const attempt of input.actionAttempts ?? []) {
    const extraction = attempt.metadata?.extraction;
    if (!isRecord(extraction) || count(extraction.recordCount) === undefined || count(extraction.pagesRead) === undefined) continue;
    const previous = latest.get(attempt.nodeId);
    const attempts = (previous?.attempts ?? 0) + 1;
    // The last read that succeeded speaks for the step; a failed one only until a later one succeeds.
    const replaces = !previous || attempt.status === "succeeded" || previous.attempt.status !== "succeeded";
    latest.set(attempt.nodeId, replaces ? { attempt, extraction, attempts } : { ...previous, attempts });
  }
  const nodes = new Map((input.flowNodes ?? []).map((node) => [node.id, node]));
  const reads = [...latest.values()].map(({ attempt, extraction, attempts }) =>
    account(attempt, extraction, attempts, nodes.get(attempt.nodeId), input.deniedEvidenceKeys));
  return { reads };
}

function account(
  attempt: AutomationStudioFlowRunActionAttemptRecord,
  extraction: JsonObject,
  attempts: number,
  node: AutomationStudioFlowNode | undefined,
  deniedKeys: readonly string[] | undefined
): AutomationStudioResultReadAccount {
  const authored = node && deniedKeys ? readParameters(node.parameterValues) : undefined;
  const stop = typeof extraction.paginationStop === "string" && STOP_WORD.test(extraction.paginationStop) ? extraction.paginationStop : undefined;
  const itemsSeen = count(extraction.itemsSeen);
  const filter = isRecord(extraction.conditions) ? extraction.conditions : undefined;
  const conditions = conditionAccounts(filter, authored, deniedKeys);
  const paginate = authored?.paginate;
  const pageLimit = isRecord(paginate) ? firstLimit(paginate) : undefined;
  const columns = isRecord(authored?.fields) ? Object.keys(authored.fields) : [];
  const dedupe = authored ? automationStudioResultReadDedupe(authored.dedupe, columns) : undefined;
  const dedupeBy = dedupe && deniedKeys ? columnKeys(dedupe.by, deniedKeys) : [];
  // A read that moves page by page leaves out a row identical to an earlier page's, dedupe or none:
  // said by the read's own count, or by its authored paging where the count did not reach the record.
  const earlierPageRepeats = count(extraction.earlierPageRepeats);
  const dropsEarlierPageRepeats = earlierPageRepeats !== undefined || movesPageByPage(paginate);
  return {
    nodeId: attempt.nodeId,
    definitionId: attempt.definitionId,
    pagesRead: count(extraction.pagesRead) ?? 0,
    ...(pageLimit !== undefined ? { pageLimit } : {}),
    ...(stop ? { stop } : {}),
    truncated: extraction.truncated === true,
    ...(itemsSeen !== undefined ? { itemsSeen } : {}),
    kept: count(extraction.recordCount) ?? 0,
    ...(authored ? { paginates: isRecord(paginate), dedupes: dedupe?.dedupes === true } : {}),
    ...(dedupeBy.length ? { dedupeBy } : {}),
    ...(dropsEarlierPageRepeats ? { dropsEarlierPageRepeats: true as const } : {}),
    ...(earlierPageRepeats !== undefined ? { earlierPageRepeats } : {}),
    ...(conditions.length ? { conditions } : {}),
    ...(filter?.unfiltered === true ? { unfiltered: true } : {}),
    ...(attempts > 1 ? { attempts } : {})
  };
}

/**
 * Each condition with the rows it rejected: as many as the read counted or the
 * step authored, whichever is more, so a count with no wording and a wording
 * with no count are both still said.
 */
function conditionAccounts(
  filter: JsonObject | undefined,
  authored: JsonObject | undefined,
  deniedKeys: readonly string[] | undefined
): NonNullable<AutomationStudioResultReadAccount["conditions"]> {
  const rejected = Array.isArray(filter?.rejected) ? filter.rejected : [];
  // What each condition's own read found, positionally like the counts; `condition.ts` decides whether it may be said.
  const seen = Array.isArray(filter?.seen) ? filter.seen : [];
  // How many rows each condition removed by itself, positionally like the counts; absent from a read that did not count it.
  const alone = Array.isArray(filter?.alone) ? filter.alone : [];
  // The rows each condition removed by itself, by label, positionally like the counts; absent from a read that did not send them (`alone-rows.ts`).
  const aloneRows = Array.isArray(filter?.aloneRows) ? filter.aloneRows : [];
  const written = Array.isArray(authored?.where) ? authored.where : [];
  const columns = isRecord(authored?.fields) ? authored.fields : undefined;
  const total = Math.max(rejected.length, written.length);
  const accounts: NonNullable<AutomationStudioResultReadAccount["conditions"]> = [];
  for (let index = 0; index < total; index += 1) {
    const condition = deniedKeys ? automationStudioResultReadConditionText(written[index], columns, deniedKeys, seen[index]) : undefined;
    const rows = count(rejected[index]);
    const byItself = count(alone[index]);
    const tested = automationStudioResultReadConditionColumn(written[index], columns);
    const leftOutOnlyByThis = deniedKeys
      ? automationStudioResultReadAloneRows(withTestedValue(aloneRows[index], tested), deniedKeys)
      : undefined;
    accounts.push({
      ...(condition ? { condition } : {}),
      ...(rows !== undefined ? { rejected: rows } : {}),
      ...(byItself !== undefined && (rows === undefined || byItself <= rows) ? { alone: byItself } : {}),
      ...(leftOutOnlyByThis ? { leftOutOnlyByThis } : {}),
      ...(leftOutOnlyByThis?.length && labelledBy(aloneRows[index], tested) ? { testedLabel: true as const } : {})
    });
  }
  return accounts;
}

/**
 * Each stored row cut to its label (its first cell) and, where the row holds
 * the column `tested` names and that is not the label's own, that cell after
 * it. Anything that is not a list of rows comes back as it was, for the screen
 * to refuse.
 */
function withTestedValue(rows: JsonValue | undefined, tested: string | undefined): JsonValue | undefined {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row): JsonValue => {
    if (!isRecord(row)) return row;
    const [label] = Object.entries(row);
    if (label === undefined) return row;
    const cut: JsonObject = { [label[0]]: label[1] };
    if (tested === undefined || tested === label[0] || INDEX_KEY.test(tested) || !Object.hasOwn(row, tested)) return cut;
    const value = row[tested];
    return typeof value === "string" ? { ...cut, [tested]: value } : cut;
  });
}

/**
 * Whether every left-out row is labelled by the column the condition tests: its
 * first cell's key is that column. False for no rows, a row that is not an
 * object, or a condition whose column is not known.
 */
function labelledBy(rows: JsonValue | undefined, tested: string | undefined): boolean {
  if (tested === undefined || !Array.isArray(rows) || rows.length === 0) return false;
  return rows.every((row) => isRecord(row) && Object.keys(row)[0] === tested);
}

/** The read's own parameters: the step's, or the one object inside them that holds what a read is authored with. */
function readParameters(parameters: JsonObject | undefined): JsonObject | undefined {
  if (!parameters) return undefined;
  const candidates = [parameters, ...Object.values(parameters).filter(isRecord)];
  return candidates.find((candidate) => READ_PARAMETER_KEYS.some((key) => Object.hasOwn(candidate, key)));
}

/** The first bound a paging setting states (`maxPages`, or its equivalent for a mode that loads rather than turns pages). */
function firstLimit(paginate: JsonObject): number | undefined {
  for (const [key, value] of Object.entries(paginate)) if (/^max/u.test(key) && count(value) !== undefined) return value as number;
  return undefined;
}

/** Column ids, held to the stored schema's own id rule and the domain's declared keys. */
function columnKeys(written: readonly string[], deniedKeys: readonly string[]): string[] {
  const denied = new Set(deniedKeys.map(automationStudioEvidenceKey));
  return written.filter((key) => AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.fieldIdPattern.test(key) && !denied.has(automationStudioEvidenceKey(key)));
}

/**
 * Whether authored paging moves to another page: `next`, which an absent
 * `mode` is, or numbered -- the two modes whose read leaves out a row an
 * earlier page already yielded. A scroll or load-more read does not.
 */
function movesPageByPage(paginate: JsonValue | undefined): boolean {
  if (!isRecord(paginate)) return false;
  const mode = paginate.mode;
  return mode === undefined || (typeof mode === "string" && PAGE_BY_PAGE_MODES.has(mode.trim().toLowerCase()));
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
