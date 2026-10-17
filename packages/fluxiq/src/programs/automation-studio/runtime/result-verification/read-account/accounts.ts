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
// **A condition over a column the rows do not store says what it read on a
// row it kept** (`stored-columns.ts`, `condition.ts`): a column read only to
// filter by reaches no row, so that value is the judge's only sight of it.
//
// **A called part's read is told by its own authored node too (t574).** A
// subflow trial runs its part across a Call Subflow boundary, so every read in
// it has a `parentAttemptId`, and until then such a read was told by its counts
// alone. Live run `run-mv7vor5f-ea4d08b4`: every subflow trial's judge got no
// condition wording, no tested value beside a left-out row, no `testedLabel`
// (so no `leftOutNamingTheItem`) and no dedupe, where the whole-candidate
// trial of the same read had them all, and three of five verdicts were wrong.
// The Flow nodes a trial passes hold the called graphs' nodes
// (`service/candidate-trial/frame-evidence.ts` merges them), so the read's node
// is found there by its id -- and only where that cannot be another step's:
// not where the root frame ran a step of the same id, and only for a node of
// the read's own definition with as many conditions as the read counted. A
// real run of a Flow whose root calls parts passes only the root's nodes, so
// its caller reads each called graph at the revision the Call Subflow attempt
// recorded and passes it keyed by that attempt (`calledNodes`,
// `../run-outcome.ts`): there the part's read is matched in its own graph, with
// the same refusals on another definition or condition count.
//
// **Each condition carries its number** (`condition-name.ts`, t574): its place
// in the authored `where`, from 1, the one index every line names it by. A
// witness placed under it drops the domain's 0-based `conditionIndex`, which
// the same run's judges read beside Core's "condition 2" as another numbering.
//
// **A presence test says what it found on both sides** (`presence.ts`, t574):
// its sentence, and each row it alone left out said with `(no value)` in the
// column it tested, where the row does not already say its value.
//
// **And the rows two or more conditions left out together** (`together-rows.ts`,
// t655), from `conditions.togetherRows` where the read sent them: each once,
// under the conditions it failed, by label, so a read's labels can name every
// row it saw.
//
// **A read that kept every item it saw, after an act repeated over a narrower
// read of the same list, carries Core's flag (`kept-every-row.ts`, t692)**,
// where the caller gives the Flow's edges (`flowEdges`), which say what list a
// loop walks: each row it stored must be checked against the request's words.
//
// **Every read, every condition and every dedupe key** (user, 2026-09-30:
// "Remove ANY AND ALL LIMITS ON THE NUMBER OF ELEMENTS PASSED TO MODEL. DO NOT
// HIDE INFORMATION"). Until then a judge saw four reads, eight conditions each
// and six dedupe keys, and was told only that more had been left out.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS } from "@fluxiq/contracts/automation-studio";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../model/index.ts";
import { automationStudioEvidenceKey } from "../../llm/index.ts";
import type { AutomationStudioResultConditionObservation, AutomationStudioResultLeftOutObservation, AutomationStudioResultReadAccount } from "../contracts/index.ts";
import { automationStudioResultReadAloneRows } from "./alone-rows.ts";
import { automationStudioResultReadConditionColumn, automationStudioResultReadConditionText } from "./condition.ts";
import { automationStudioResultReadDedupe } from "./dedupe.ts";
import { automationStudioResultReadKeptEveryRow } from "./kept-every-row.ts";
import { automationStudioResultReadLoopedAccount } from "./looped-account.ts";
import { automationStudioResultReadParameters } from "./read-parameters.ts";
import { automationStudioResultReadLoopPasses } from "./loop-passes.ts";
import { automationStudioResultReadPresence } from "./presence.ts";
import { automationStudioResultReadStoredColumns } from "./stored-columns.ts";
import { automationStudioResultReadTogetherRows } from "./together-rows.ts";

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
  /**
   * The nodes of each graph a Call Subflow step ran, keyed by that Call
   * Subflow attempt's `attemptId` -- the `parentAttemptId` of every attempt its
   * frame made -- where the caller read the graph at the revision the run
   * recorded (`../run-outcome.ts`). A called read whose frame is here is told
   * by its own graph's node exactly; one whose frame is not falls back to
   * `flowNodes`, as a trial's merged graph holds the parts' nodes (header).
   */
  calledNodes?: ReadonlyMap<string, readonly AutomationStudioFlowNode[]> | undefined;
  /**
   * The Flow's edges, with `flowNodes`: what list each loop walks. Given, a read
   * that kept every item it saw after an act repeated over a narrower read of
   * the same list carries `keptEveryRow` (header, t692). Absent, none does.
   */
  flowEdges?: readonly AutomationStudioFlowEdge[] | undefined;
};

/**
 * One account per step that reported a read, in the order each first read:
 * every one of them. A step outside a loop speaks with its last successful
 * read; one that ran as the passes of a loop, with every pass added up.
 *
 * A called part's read (`parentAttemptId`) is a step of its own call: its
 * loops are read from its own frame's attempts. It is told by its authored
 * node: from its own called graph (`calledNodes`) where the caller gave it,
 * else where the Flow's nodes hold one that can only be its own (header,
 * t574); by its counts alone where the root frame ran a step of the same id
 * and no called graph was given, or the node is of another definition or
 * condition count.
 *
 * `authoredNodes` is the node each read was told by, aligned with `reads`, so
 * a reader of the same reads (`../value-readings/`) uses the very node, never
 * one found again by id.
 */
export function automationStudioResultReadAccounts(input: AutomationStudioResultReadAccountsInput): { reads: AutomationStudioResultReadAccount[]; authoredNodes: Array<AutomationStudioFlowNode | undefined> } {
  const latest = new Map<string, { attempt: AutomationStudioFlowRunActionAttemptRecord; extraction: JsonObject; attempts: number }>();
  const run = input.actionAttempts ?? [];
  for (const attempt of run) {
    const extraction = readExtraction(attempt);
    if (!extraction) continue;
    const key = attempt.parentAttemptId === undefined ? attempt.nodeId : `${attempt.parentAttemptId} ${attempt.nodeId}`;
    const previous = latest.get(key);
    const attempts = (previous?.attempts ?? 0) + 1;
    // The last read that succeeded speaks for the step; a failed one only until a later one succeeds.
    const replaces = !previous || attempt.status === "succeeded" || previous.attempt.status !== "succeeded";
    latest.set(key, replaces ? { attempt, extraction, attempts } : { ...previous, attempts });
  }
  const nodes = new Map((input.flowNodes ?? []).map((node) => [node.id, node]));
  // The steps the root frame ran: a called part's step of the same id is not told by that node (header).
  const rootSteps = new Set(run.filter((attempt) => attempt.parentAttemptId === undefined).map((attempt) => attempt.nodeId));
  const authored = (attempt: AutomationStudioFlowRunActionAttemptRecord, nodeId: string, extraction?: JsonObject): AutomationStudioFlowNode | undefined => {
    if (attempt.parentAttemptId === undefined) return nodes.get(nodeId);
    // Its own called graph where the caller read it; else the Flow's nodes, unless the root frame ran that id.
    const called = input.calledNodes?.get(attempt.parentAttemptId);
    const node = called ? called.find((candidate) => candidate.id === nodeId) : rootSteps.has(nodeId) ? undefined : nodes.get(nodeId);
    if (!node) return undefined;
    return extraction === undefined || (node.definitionId === attempt.definitionId && sameConditionCount(node, extraction)) ? node : undefined;
  };
  const authoredNodes: Array<AutomationStudioFlowNode | undefined> = [];
  const reads = [...latest.values()].map(({ attempt, extraction, attempts }) => {
    const node = authored(attempt, attempt.nodeId, extraction);
    authoredNodes.push(node);
    // A step that ran as the passes of a loop speaks with every pass (`loop-passes.ts`, `looped-account.ts`), read in its own frame.
    const frame = run.filter((candidate) => candidate.parentAttemptId === attempt.parentAttemptId);
    const loop = automationStudioResultReadLoopPasses(frame, (candidate) => candidate.nodeId === attempt.nodeId && readExtraction(candidate) !== undefined);
    if (!loop) return account(attempt, extraction, attempts, node, input.deniedEvidenceKeys);
    const passes = loop.passes.map((tries) => {
      const speaking = [...tries].reverse().find((tried) => tried.status === "succeeded") ?? tries[tries.length - 1]!;
      return account(speaking, readExtraction(speaking)!, 1, node, input.deniedEvidenceKeys);
    });
    return automationStudioResultReadLoopedAccount({ passes, attempts, stop: loop.stop, pageLimit: mostPasses(authored(attempt, loop.repeatNodeId)) });
  });
  if (!input.flowEdges) return { reads, authoredNodes };
  // A read that kept every item it saw after an act repeated over a narrower read of the same list (header, t692).
  const speaking = [...latest.values()].map(({ attempt }) => attempt);
  const flags = automationStudioResultReadKeptEveryRow({ reads, nodes: authoredNodes, speaking, flowNodes: input.flowNodes ?? [], flowEdges: input.flowEdges, actionAttempts: run });
  return { reads: reads.map((read, index) => flags[index] ? { ...read, keptEveryRow: flags[index] } : read), authoredNodes };
}

/** Whether a node's authored conditions are as many as the read counted rejections for; true where either is not said. */
function sameConditionCount(node: AutomationStudioFlowNode, extraction: JsonObject): boolean {
  const written = automationStudioResultReadParameters(node.parameterValues)?.where;
  const rejected = isRecord(extraction.conditions) ? extraction.conditions.rejected : undefined;
  return !Array.isArray(written) || !Array.isArray(rejected) || written.length === rejected.length;
}

/** The read's own account of itself on an attempt, when it reported one. */
function readExtraction(attempt: AutomationStudioFlowRunActionAttemptRecord): JsonObject | undefined {
  const extraction = attempt.metadata?.extraction;
  return isRecord(extraction) && count(extraction.recordCount) !== undefined && count(extraction.pagesRead) !== undefined ? extraction : undefined;
}

/** The most passes a loop's Repeat was authored with, when it states a count. */
function mostPasses(repeat: AutomationStudioFlowNode | undefined): number | undefined {
  const most = count(repeat?.parameterValues?.most);
  return most !== undefined && most > 0 ? most : undefined;
}

function account(
  attempt: AutomationStudioFlowRunActionAttemptRecord,
  extraction: JsonObject,
  attempts: number,
  node: AutomationStudioFlowNode | undefined,
  deniedKeys: readonly string[] | undefined
): AutomationStudioResultReadAccount {
  const authored = node && deniedKeys ? automationStudioResultReadParameters(node.parameterValues) : undefined;
  const stop = typeof extraction.paginationStop === "string" && STOP_WORD.test(extraction.paginationStop) ? extraction.paginationStop : undefined;
  const itemsSeen = count(extraction.itemsSeen);
  const filter = isRecord(extraction.conditions) ? extraction.conditions : undefined;
  // A condition over a column the rows do not store says what it read (`condition.ts`, `stored-columns.ts`).
  const stored = authored ? automationStudioResultReadStoredColumns(extraction, node?.parameterValues) : undefined;
  const conditions = conditionAccounts(filter, authored, deniedKeys, stored);
  // The rows two or more conditions left out together, by label, under the bound domain's declared keys only (`together-rows.ts`, t655).
  const together = deniedKeys ? automationStudioResultReadTogetherRows(filter?.togetherRows, conditions.length, deniedKeys) : undefined;
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
    ...(together ? { leftOutTogether: together } : {}),
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
  deniedKeys: readonly string[] | undefined,
  stored: ReadonlySet<string> | undefined
): NonNullable<AutomationStudioResultReadAccount["conditions"]> {
  const rejected = Array.isArray(filter?.rejected) ? filter.rejected : [];
  // What each condition's own read found, positionally like the counts; `condition.ts` decides whether it may be said.
  const seen = Array.isArray(filter?.seen) ? filter.seen : [];
  // How many rows each condition removed by itself, positionally like the counts; absent from a read that did not count it.
  const alone = Array.isArray(filter?.alone) ? filter.alone : [];
  // The rows each condition removed by itself, by label, positionally like the counts; absent from a read that did not send them (`alone-rows.ts`).
  const aloneRows = Array.isArray(filter?.aloneRows) ? filter.aloneRows : [];
  const aloneObservations = Array.isArray(filter?.aloneObservations) && filter.aloneObservations.length === aloneRows.length ? filter.aloneObservations : [];
  const written = Array.isArray(authored?.where) ? authored.where : [];
  const columns = isRecord(authored?.fields) ? authored.fields : undefined;
  const total = Math.max(rejected.length, written.length);
  const accounts: NonNullable<AutomationStudioResultReadAccount["conditions"]> = [];
  for (let index = 0; index < total; index += 1) {
    const rejectedRows = count(rejected[index]);
    const byItself = count(alone[index]);
    const tested = automationStudioResultReadConditionColumn(written[index], columns);
    const authoredCondition = written[index];
    const read = isRecord(authoredCondition) && isRecord(authoredCondition.read) ? authoredCondition.read : undefined;
    const evidenceKey = tested ?? (typeof read?.attribute === "string" ? read.attribute : undefined);
    // A presence test says what it found on both sides, where it names the column it read and no witness of a row it left out says it found one (`presence.ts`, header).
    const witnesses = aloneObservations[index];
    const foundOnLeftOut = Array.isArray(witnesses) && witnesses.some((witness) => isRecord(witness) && witness.state === "present");
    const presence = deniedKeys && evidenceKey !== undefined && !foundOnLeftOut ? automationStudioResultReadPresence(authoredCondition, deniedKeys, seen[index]) : undefined;
    const rows = withTestedValue(aloneRows[index], tested, presence ? evidenceKey : undefined);
    let leftOutObservations: Array<AutomationStudioResultConditionObservation | null> | undefined;
    const leftOutOnlyByThis = deniedKeys
      ? automationStudioResultReadAloneRows(rows, deniedKeys, undefined, { observations: aloneObservations[index], conditionIndex: index, evidenceKey, onScreened: observations => { leftOutObservations = observations; } })
      : undefined;
    // A presence test of its own read is said by the word it found on a row it left out, screened as those rows are (`condition.ts`, t482 N3).
    const leftOutSeen = leftOutObservations?.find((observation) => observation?.state === "present")?.value;
    const condition = deniedKeys ? automationStudioResultReadConditionText(written[index], columns, deniedKeys, seen[index], stored, leftOutSeen) : undefined;
    accounts.push({
      number: index + 1,
      ...(condition ? { condition } : {}),
      ...(rejectedRows !== undefined ? { rejected: rejectedRows } : {}),
      ...(byItself !== undefined && (rejectedRows === undefined || byItself <= rejectedRows) ? { alone: byItself } : {}),
      ...(leftOutOnlyByThis ? { leftOutOnlyByThis } : {}),
      ...(leftOutObservations ? { leftOutObservations: leftOutObservations.map(underItsCondition) } : {}),
      ...(leftOutOnlyByThis?.length && labelledBy(aloneRows[index], tested) ? { testedLabel: true as const } : {}),
      ...(presence && leftOutOnlyByThis?.length ? { presence } : {})
    });
  }
  return accounts;
}

/** A witness as its condition carries it: the condition is the one it sits under, so its own index goes (header). */
function underItsCondition(observation: AutomationStudioResultConditionObservation | null): AutomationStudioResultLeftOutObservation | null {
  if (observation === null) return null;
  const { conditionIndex: _index, ...witness } = observation;
  return witness;
}

/**
 * Each stored row cut to its label (its first cell) and, where the row holds
 * the column `tested` names and that is not the label's own, that cell after
 * it. For a presence test, a row that does not hold the column it read
 * (`presenceKey`) is given it empty, so it is said `(no value)`: the condition
 * left it out because its read found nothing there. Anything that is not a
 * list of rows comes back as it was, for the screen to refuse.
 */
function withTestedValue(rows: JsonValue | undefined, tested: string | undefined, presenceKey?: string): JsonValue | undefined {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row): JsonValue => {
    if (!isRecord(row)) return row;
    const [label] = Object.entries(row);
    if (label === undefined) return row;
    const cut: JsonObject = { [label[0]]: label[1] };
    const value = tested !== undefined && Object.hasOwn(row, tested) ? row[tested] : undefined;
    if (tested !== undefined && tested !== label[0] && !INDEX_KEY.test(tested) && typeof value === "string") return { ...cut, [tested]: value };
    if (presenceKey === undefined || presenceKey === label[0] || INDEX_KEY.test(presenceKey) || Object.hasOwn(row, presenceKey)) return cut;
    return { ...cut, [presenceKey]: "" };
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
