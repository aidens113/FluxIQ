// The account of a run's result that one verification call is shown: every
// record set, every column, every stored row and every value whole, and every
// step of the Flow with the parameters it was authored with (2026-09-30, "the
// model sees the whole page"). There is no record-set, row, column, value,
// step or byte limit, and no sample: the rows the model is shown are the rows
// the run stored.
//
// **Rows come off a medium Core does not know, so they are screened, not
// trusted.** A caller that has no declared-keys list gets no rows at all --
// absent means nobody said, never "deny nothing", which is the rule the request
// evidence check states and this follows. With a declaration, a column whose id
// the domain denies carries no values, and a value shaped like a credential is
// replaced by a marker; either sets `withheld`, so the model is never shown a
// screened picture that reads as a whole one. Nothing widens what a domain
// already chose to hand over -- a stored row has already had its `exclude`
// fields removed by the record schema's allowlist copy before it ever reached
// the store.
//
// **The Flow's steps say what they run with**, through the repair context's own
// parameter screen (`parameter-screen.ts`), with the same rule about a missing
// declaration: the judgement is shown what the repair it triggers is shown.
//
// **Core also checks the rows against the set's own schema, and counts.** A
// field the Flow's record schema declares `required` must carry a value in
// every row. Record validation already refuses a row where it is absent or
// null, so what reaches the store and fails here is the value that validation
// cannot see is empty: a string with nothing in it. The check reads only what
// the Flow declared, and what leaves is two counts and the field ids.
//
// **The steps are listed in the order the Flow runs them** where its edges are
// given, never in the order its store keeps the nodes: run
// `run-murwd8le-79e735a8`'s post-run check read s1, s10, s11 ... s9, Add to cart
// before the search (Cause 8).
//
// **And the judge is shown the page the run ended on** (`endView`), where the
// caller holds one: the domain's own compact view of its target, as the domain
// produced it, after the last step. The same run's checks judged a cart from
// status rows alone, with `Cart (3)` and the coupon's "Collected" on the page
// they never saw, and one of them invented a quantity that was never committed
// (Cause 7). It is screened like a row: no view without a declaration of the
// domain's denied keys, and none that holds a denied key or a credential-shaped
// value; either sets `withheld`.
//
// **And each step says what it changed in this run** (`changed`, from the
// session's own trace, `./step-changes.ts`), screened the same way: run
// `run-muw5zv4m-52d83027`'s judges, shown status rows and a stale end, read one
// "+" press as a quantity of 1 and a search as the item chosen after it.
//
// **And each record set says how its collected rows became its answer**
// (`processing`, read-list design 5.2): rows collected, repeats, rows a
// condition over stored columns or the limit left out, and each pass's rows.
// Counts and node ids, as the store holds them -- and, per `where` condition,
// the rows it alone left out, by label, screened as the rows are
// (`./processing-account.ts`, t493): live run `run-mv6bg8d8-1a461436`'s judges
// read `filteredOut: 5` as five accessories, three of them the item asked for.
//
// **And the page as it stood before the run did anything** (`startView`), by
// the domain's declared view keys and screened exactly as the end view is. A
// finished run starts on whatever the site already held, so run
// `run-mux6pndp-16feb842`'s judges read the header's "2 · $28.96" -- a soap
// and an earlier 3-Pack -- as the two towel packs asked for. It is read off the
// session's own trace: the first attempt that saw the page, and the page it
// found -- or, when that step moved to another document (the diff's
// `documentChanged`; one recorded before that word, `locationChanged`), the
// page it left, which is the site before any act. A step before it that saw no
// page (a model or code step) did not change it. Nothing captured, no start.
//
// **And a step that runs per row names only the rows it acted on** (t475,
// `./step-rows.ts`): `rowsActedOn`, each by its own fields. Its authored
// parameters named the row it was written on -- lane D round 10's Confirm step
// carried the listing's first row, one its condition left out, and the judge
// read the step as pressing Confirm on every row -- so that row's identity
// (`ROW_PLACE`) is left out of them, and `perRow` says why. A saved trace
// holds a marker where a captured row was, so each pass's row is read back
// from the stored rows where they still stand in capture order
// (`./captured-rows.ts`, t482): lane D round 12 (`run-mv62icw0-070f88ad`, D3)
// sent four rows as `{}`.
//
// **And each read names the steps that acted on the page before it**
// (`narrowedBefore`, t482, `./narrowed-before.ts`): a site filter's lost rows
// never reach the read, so no condition's left-out rows can show them.
//
// **And how Core read the values its conditions and sort compared** (t511,
// `./value-readings/`): per condition, the number a bound read or the part of
// the text a text test found, on a few kept and left-out rows (`valuesRead`),
// and per record set, what each sort key read its column as and whether the
// rows are in that order (`sortRead`). Live run `run-mv6qr7fk-77f30b49`'s judges
// never saw "£72k" read as 72, and four times called a date-sorted answer
// unsorted.
//
// **And the single value each step returned** (`returned`, t757,
// `./returned-values.ts`), by step in run order, with Core's sentence that a
// returned value is handed on and is no stored record: auction
// `run-mveba82m-fd0616dc`'s judges saw three read values only as authored
// targets and page text, beside no record set, and said yes.

import type { AutomationStudioRecordSchema, AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../model/index.ts";
import { screenAutomationStudioLlmEvidence } from "../llm/index.ts";
import { automationStudioReferenceNow } from "../reference-now/index.ts";
import { automationStudioScreenedNodeParameters } from "../recovery/repair-context/index.ts";
import type {
  AutomationStudioResultEndView,
  AutomationStudioResultFlowStepSummary,
  AutomationStudioResultKeptEveryRow,
  AutomationStudioResultRecordSetSummary,
  AutomationStudioRunResultSummary
} from "./contracts/index.ts";
import { automationStudioResultCapturedRows } from "./captured-rows.ts";
import { automationStudioResultNarrowedBefore } from "./narrowed-before.ts";
import { automationStudioResultProcessingAccount } from "./processing-account.ts";
import { automationStudioResultReadAccounts } from "./read-account/index.ts";
import { automationStudioResultReturnedValues } from "./returned-values.ts";
import { automationStudioResultStepChanges } from "./step-changes.ts";
import { automationStudioResultStepRows } from "./step-rows.ts";
import { automationStudioResultValueReadings } from "./value-readings/index.ts";

/** Stands in, in a row, for a value shaped like a credential or carrying a denied key. */
const WITHHELD_VALUE = "[withheld]";

/** Says, on a step that runs per row, what its rows and parameters are (header). */
const PER_ROW = "This step runs once per row of its loop. rowsActedOn lists the rows it acted on in this run, one per pass; the row it was written on is left out of its parameters, and is not a row it acted on.";

/**
 * The keys under which a step's target names the row it was written on: the
 * record it sat in and its place in a list or table. Core's own vocabulary for
 * where a target sits among rows, as the `target` family is for what a repair
 * addresses (`../llm/harness/evidence-screen.ts`); read only on a step whose
 * rows this run names.
 */
const ROW_PLACE = /^(?:record|row|listposition|tableposition)$/u;

/** One traced attempt, as far as this reads it: its diff, the domain's view of the page before and after it, and how it ended. */
type TracedAttempt = {
  nodeId: string;
  route?: string | undefined;
  status?: string | undefined;
  outputs?: Readonly<Record<string, unknown>> | undefined;
  skipped?: unknown;
  stateHeld?: unknown;
  stateRefs?: { stateDiff?: JsonObject; beforeAction?: { summary?: JsonObject | undefined }; afterAction?: { summary?: JsonObject | undefined } } | undefined;
};

// `AutomationStudioResultEndView` and the summary's `endView` live in
// `./contracts/run-result-summary.ts`; re-exported here for the callers that read them from here.
export type { AutomationStudioResultEndView } from "./contracts/index.ts";

/** @deprecated The summary itself now carries `endView` (`./contracts/run-result-summary.ts`); kept for the callers that still name this. */
export type AutomationStudioRunResultSummaryWithEndView = AutomationStudioRunResultSummary;

/** One record set as the caller reads it out of the store. */
export type AutomationStudioResultRecordSetInput = {
  summary: AutomationStudioRunDatasetSummary;
  /** The stored schema (no `exclude` field), when the set's page could be read. */
  schema?: AutomationStudioRecordSchema;
  /** Every stored row of the set. Screened here, never cut. */
  rows?: readonly JsonObject[];
  /**
   * The rows Core checks for required values. Absent, `rows` is checked
   * instead.
   */
  checkedRows?: readonly JsonObject[];
};

export type AutomationStudioRunResultSummaryInput = {
  recordSets: readonly AutomationStudioResultRecordSetInput[];
  /** The Flow's authored nodes, in order: the shape of what it can do at all. */
  flowNodes?: readonly AutomationStudioFlowNode[];
  /** The Flow's edges. Given, the nodes are listed in the order the Flow runs them. */
  flowEdges?: readonly AutomationStudioFlowEdge[] | undefined;
  /** The view the run ended on, as the caller read it. Screened here. */
  endView?: AutomationStudioResultEndView | undefined;
  /** The kind of error a read of that view failed with: none is sent, and the summary says one was withheld. */
  endViewUnreadable?: string | undefined;
  /**
   * The run's recorded attempts, for how each list read went
   * (`read-account/`). Absent, the summary carries no reads.
   */
  actionAttempts?: readonly AutomationStudioFlowRunActionAttemptRecord[] | undefined;
  /**
   * The nodes of each graph a Call Subflow step ran, keyed by that Call Subflow
   * attempt's `attemptId`, for a part's read to be told by its own node
   * (`read-account/accounts.ts`, t574). Absent, a part's read is matched in
   * `flowNodes`, as a trial's merged graph allows.
   */
  calledNodes?: ReadonlyMap<string, readonly AutomationStudioFlowNode[]> | undefined;
  /**
   * This session's traced attempts, in the order they ran, for what each step
   * changed (`./step-changes.ts`) and the page the run started on. Absent, no
   * step says what it changed and there is no start.
   */
  sessionAttempts?: readonly TracedAttempt[] | undefined;
  /**
   * The domain's declared view keys: the start page is its snapshot under
   * these keys only. Absent, the keys the end view holds, which the end-view
   * reader already cut to the declared ones, so the two pages are cut alike;
   * with neither, there is no start.
   */
  observedStateKeys?: readonly string[] | undefined;
  /**
   * The bound domain's declared denied keys, exactly as declared. Absent means
   * no declaration was made, and no row is carried at all.
   */
  deniedEvidenceKeys?: readonly string[] | undefined;
  /** Numeric override for relative dates in value readings. Absent, use the execution reference, then summary time. */
  now?: number | undefined;
  /** The execution's fixed reference. A caller's numeric `now` override still wins. */
  referenceNow?: number | undefined;
};

/**
 * The screened summary of what a run produced, whole.
 *
 * `withheld` is true whenever anything was screened out or the store itself
 * reported the set truncated, so the model is never shown a partial picture
 * that reads as a whole one.
 */
export function summarizeAutomationStudioRunResult(input: AutomationStudioRunResultSummaryInput): AutomationStudioRunResultSummaryWithEndView {
  const referenceNow = input.now ?? automationStudioReferenceNow(input.referenceNow) ?? Date.now();
  const totalRecordCount = input.recordSets.reduce((total, set) => total + safeCount(set.summary.recordCount), 0);
  const totalRefusedCount = input.recordSets.reduce((total, set) => total + safeCount(set.summary.invalidCount), 0);
  let withheld = false;
  const summarizedSets: AutomationStudioResultRecordSetSummary[] = [];
  for (const set of input.recordSets) {
    const summarized = summarizedRecordSet(set, input.deniedEvidenceKeys);
    if (summarized.withheld) withheld = true;
    summarizedSets.push(summarized.summary);
  }
  const flowNodes = input.flowEdges ? inRunOrder(input.flowNodes ?? [], input.flowEdges) : input.flowNodes ?? [];
  const changes = automationStudioResultStepChanges(input.sessionAttempts, input.deniedEvidenceKeys);
  if (changes.withheld) withheld = true;
  // A run's own rows, per step that runs per row (t475); a summary of no run names none.
  // A saved trace holds a marker where a captured row was, so a pass's row is read back from the stored rows where they stand in capture order (`./captured-rows.ts`, t482).
  const capturedRow = automationStudioResultCapturedRows(input.recordSets, flowNodes);
  const perRow = input.sessionAttempts ? automationStudioResultStepRows({ flowNodes, flowEdges: input.flowEdges, attempts: input.sessionAttempts, deniedEvidenceKeys: input.deniedEvidenceKeys, capturedRow }) : undefined;
  if (perRow?.withheld) withheld = true;
  const flowShape = flowNodes.map((node) => {
    const changed = changes.byNode.get(node.id);
    const bound = perRow?.rowBound.has(node.id) === true;
    return {
      ...step(node, input.deniedEvidenceKeys, bound),
      ...(changed ? { changed } : {}),
      ...(bound ? { rowsActedOn: [...(perRow?.rows.get(node.id) ?? [])], perRow: PER_ROW } : {})
    };
  });
  // The single value each step returned, said as handed on and no stored record (`./returned-values.ts`, t757).
  const returned = automationStudioResultReturnedValues(input.sessionAttempts, input.deniedEvidenceKeys);
  if (returned.withheld) withheld = true;
  const ended = input.endView ? automationStudioResultEndView(input.endView, input.deniedEvidenceKeys) : undefined;
  if (ended?.withheld || input.endViewUnreadable !== undefined) withheld = true;
  const begun = startedOn(input.sessionAttempts, input.observedStateKeys ?? viewKeysOf(input.endView));
  const started = begun ? automationStudioResultEndView(begun, input.deniedEvidenceKeys) : undefined;
  if (started?.withheld) withheld = true;
  // How each list read went (`read-account/`): pages, why paging stopped, and
  // what each condition rejected, so a judge is not shown a step's name alone.
  // With the Flow's edges, a read that kept every item it saw after an act over a narrower read of the same list is flagged (t692).
  const accounted = automationStudioResultReadAccounts({ actionAttempts: input.actionAttempts, flowNodes, deniedEvidenceKeys: input.deniedEvidenceKeys, ...(input.calledNodes ? { calledNodes: input.calledNodes } : {}), ...(input.flowEdges ? { flowEdges: input.flowEdges } : {}) });
  // And the steps that acted on the page before each read (`./narrowed-before.ts`, t482), for a read of this Flow's own nodes.
  const own = accounted.reads.filter((read) => flowNodes.some((node) => node.id === read.nodeId && node.definitionId === read.definitionId));
  const narrowed = automationStudioResultNarrowedBefore({ readNodeIds: own.map((read) => read.nodeId), flowNodes, attempts: input.sessionAttempts, deniedEvidenceKeys: input.deniedEvidenceKeys });
  if (narrowed.withheld) withheld = true;
  const narrowedReads = accounted.reads.map((read) => {
    const before = own.includes(read) ? narrowed.byRead.get(read.nodeId) : undefined;
    const flagged = read.keptEveryRow ? { ...read, keptEveryRow: withStoredIn(read.keptEveryRow, read.nodeId, input.recordSets) } : read;
    return before ? { ...flagged, narrowedBefore: before } : flagged;
  });
  // How Core read the values each condition and sort compared (t511), from the rows already screened above.
  // Each read by the very node it was told by (t574): a part's read is never matched again by id among the root's nodes.
  const read = automationStudioResultValueReadings({ reads: narrowedReads, authoredNodes: accounted.authoredNodes, recordSets: summarizedSets, flowNodes, now: referenceNow });
  const reads = read.reads;
  const recordSets = read.recordSets;
  // The start view first: every trial of one build starts from the same reset
  // page, so it is the same bytes in each trial judge's request, and only bytes
  // before the first that differ are served from the provider's cache (t493,
  // from t492's measurement). Everything after it varies per trial.
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    ...(started?.endView ? { startView: started.endView } : {}),
    totalRecordCount,
    totalRefusedCount,
    totalRowsMissingRequired: recordSets.reduce((total, set) => total + set.rowsMissingRequired, 0),
    recordSetCount: input.recordSets.length,
    recordSets,
    ...(reads.length ? { reads } : {}),
    flowShape,
    ...(returned.returned ? { returned: returned.returned } : {}),
    withheld,
    ...(ended?.endView ? { endView: ended.endView } : {}),
    referenceNow
  };
}

/**
 * A flagged read's flag with the record sets it stored (t692): each set whose
 * writers (`nodeIds`) or collecting passes name the read, so a yes is held to
 * each of their rows whether or not the set says its passes.
 */
function withStoredIn(flag: AutomationStudioResultKeptEveryRow, nodeId: string, recordSets: readonly AutomationStudioResultRecordSetInput[]): AutomationStudioResultKeptEveryRow {
  const storedIn = recordSets.filter((set) => set.summary.nodeIds?.includes(nodeId) || set.summary.processing?.passes.some((pass) => pass.node === nodeId)).map((set) => set.summary.datasetId);
  return storedIn.length ? { ...flag, storedIn: [...new Set(storedIn)] } : flag;
}

/**
 * The page the run started on, as the domain's snapshot showed it, under its
 * declared top-level view keys (as `../service/end-view/look.ts` keeps them):
 * the first attempt that saw the page, and the page it found, or the page it
 * left when it moved to another document. None without a snapshot on that side.
 */
function startedOn(attempts: readonly TracedAttempt[] | undefined, viewKeys: readonly string[] | undefined): AutomationStudioResultEndView | undefined {
  const keys = (viewKeys ?? []).filter((key) => !key.includes("."));
  const first = attempts?.find((attempt) => attempt.stateRefs?.beforeAction?.summary !== undefined || attempt.stateRefs?.afterAction?.summary !== undefined);
  if (!keys.length || !first?.stateRefs) return undefined;
  const { stateDiff: diff, beforeAction, afterAction } = first.stateRefs;
  const moved = diff !== undefined && (diff.documentChanged === undefined ? diff.locationChanged === true : diff.documentChanged === true);
  const seen = moved ? afterAction?.summary : beforeAction?.summary;
  if (!seen) return undefined;
  const view = Object.fromEntries(keys.filter((key) => Object.hasOwn(seen, key)).map((key) => [key, seen[key]!]));
  return Object.keys(view).length ? { view } : undefined;
}

/** The keys an end view holds, which the end-view reader already cut to the domain's declared ones; none when it holds no object. */
function viewKeysOf(endView: AutomationStudioResultEndView | undefined): string[] | undefined {
  const view = endView?.view;
  return view !== null && typeof view === "object" && !Array.isArray(view) ? Object.keys(view) : undefined;
}

/**
 * The view a run ended on, through the deployment's reader. A read that fails
 * is answered with the error's kind, never its message (which can carry what
 * the page held), and never as no view: the check is still made, without one,
 * and its summary says one was withheld.
 */
export async function automationStudioResultEndViewRead(
  read: (() => Promise<AutomationStudioResultEndView | undefined>) | undefined
): Promise<{ endView?: AutomationStudioResultEndView; endViewUnreadable?: string }> {
  if (!read) return {};
  try {
    const endView = await read();
    return endView ? { endView } : {};
  } catch (error) {
    return { endViewUnreadable: error instanceof Error && error.name ? error.name : "unknown error" };
  }
}

/**
 * The view a run or test ended on, made sendable: none at all without a
 * declaration of the domain's denied keys, and none that holds a denied key or
 * a credential-shaped value anywhere -- a page is one value, so it is sent
 * whole or not at all. `withheld` says one was held and not sent.
 */
export function automationStudioResultEndView(
  ended: AutomationStudioResultEndView,
  deniedEvidenceKeys: readonly string[] | undefined
): { endView?: AutomationStudioResultEndView; withheld: boolean } {
  if (deniedEvidenceKeys === undefined) return { withheld: true };
  const found = screenAutomationStudioLlmEvidence(ended.view, deniedEvidenceKeys);
  if (found.deniedKey || found.secretShaped) return { withheld: true };
  return { endView: { ...(ended.after !== undefined ? { after: ended.after } : {}), view: ended.view }, withheld: false };
}

/**
 * The nodes in the order the Flow runs them. A depth-first walk from every
 * node nothing enters -- then from any node only a cycle reaches, in authored
 * order -- numbers each node as it is first reached and finds each loop's
 * return edge (one back to a node still on the walk). Then, over the other
 * edges, a node is listed once every node that leads to it is, the
 * earliest-reached first: a merge after both of its branches, a branch's steps
 * after the step they branch from. A node's way on is walked before its
 * `failed` way, which is the way round a skipped step.
 */
function inRunOrder(nodes: readonly AutomationStudioFlowNode[], edges: readonly AutomationStudioFlowEdge[]): AutomationStudioFlowNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const next = new Map<string, string[]>();
  const entered = new Set<string>();
  const wayOnFirst = [...edges].sort((a, b) => Number(a.sourcePortId === "failed") - Number(b.sourcePortId === "failed"));
  for (const edge of wayOnFirst) {
    if (!byId.has(edge.sourceNodeId) || !byId.has(edge.targetNodeId)) continue;
    next.set(edge.sourceNodeId, [...(next.get(edge.sourceNodeId) ?? []), edge.targetNodeId]);
    entered.add(edge.targetNodeId);
  }
  const reached = new Map<string, number>();
  const onWalk = new Set<string>();
  const returns = new Set<string>();
  const edgeKey = (from: string, to: string): string => JSON.stringify([from, to]);
  const visit = (id: string): void => {
    reached.set(id, reached.size);
    onWalk.add(id);
    for (const to of next.get(id) ?? []) {
      if (onWalk.has(to)) returns.add(edgeKey(id, to));
      else if (!reached.has(to)) visit(to);
    }
    onWalk.delete(id);
  };
  for (const node of nodes) if (!entered.has(node.id) && !reached.has(node.id)) visit(node.id);
  for (const node of nodes) if (!reached.has(node.id)) visit(node.id);
  const waiting = new Map(nodes.map((node) => [node.id, 0]));
  for (const [from, targets] of next) {
    for (const to of targets) if (!returns.has(edgeKey(from, to))) waiting.set(to, waiting.get(to)! + 1);
  }
  const ready = nodes.filter((node) => waiting.get(node.id) === 0).map((node) => node.id);
  const run: AutomationStudioFlowNode[] = [];
  while (ready.length) {
    ready.sort((a, b) => reached.get(a)! - reached.get(b)!);
    const id = ready.shift()!;
    run.push(byId.get(id)!);
    for (const to of next.get(id) ?? []) {
      if (returns.has(edgeKey(id, to))) continue;
      const left = waiting.get(to)! - 1;
      waiting.set(to, left);
      if (left === 0) ready.push(to);
    }
  }
  return run;
}

/**
 * One step, with the name the Flow gave it and, under a declaration, the
 * parameters it was authored with, screened by the repair context's screen.
 */
function step(node: AutomationStudioFlowNode, deniedEvidenceKeys: readonly string[] | undefined, perRow = false): AutomationStudioResultFlowStepSummary {
  const named: AutomationStudioResultFlowStepSummary = {
    nodeId: node.id,
    definitionId: node.definitionId,
    ...(node.label ? { label: node.label } : {})
  };
  if (deniedEvidenceKeys === undefined || !node.parameterValues || Object.keys(node.parameterValues).length === 0) return named;
  const authored = perRow ? withoutRowPlace(node.parameterValues) : node.parameterValues;
  const screened = automationStudioScreenedNodeParameters(authored, deniedEvidenceKeys);
  return { ...named, parameters: screened.values, ...(screened.withheld.length ? { parametersWithheld: screened.withheld } : {}) };
}

/** `parameters` with every value under a row-place key left out, at any depth (header). */
function withoutRowPlace(parameters: JsonObject): JsonObject {
  const strip = (value: JsonValue): JsonValue => {
    if (Array.isArray(value)) return value.map(strip);
    if (value === null || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !ROW_PLACE.test(key.toLowerCase().replace(/[^a-z0-9]/gu, ""))).map(([key, child]) => [key, strip(child)]));
  };
  return strip(parameters) as JsonObject;
}

function summarizedRecordSet(
  set: AutomationStudioResultRecordSetInput,
  deniedEvidenceKeys: readonly string[] | undefined
): { summary: AutomationStudioResultRecordSetSummary; withheld: boolean } {
  const columns = (set.schema?.fields ?? []).map((field) => field.id);
  const rows = set.rows ?? [];
  const screened = deniedEvidenceKeys === undefined ? undefined : screenedRows(rows, columns, deniedEvidenceKeys);
  const processing = set.summary.processing ? automationStudioResultProcessingAccount(set.summary.processing, deniedEvidenceKeys) : undefined;
  const summary: AutomationStudioResultRecordSetSummary = {
    datasetId: set.summary.datasetId,
    ...(set.summary.label ? { label: set.summary.label } : {}),
    recordCount: safeCount(set.summary.recordCount),
    refusedCount: safeCount(set.summary.invalidCount),
    truncated: set.summary.truncated === true,
    columns,
    columnsWithheld: false,
    ...requiredValueCheck(set),
    ...(screened && screened.rows.length ? { sampleRows: screened.rows } : {}),
    // How the collected rows became the answer (read-list design 5.2), and per condition the rows it alone left out, screened (t493): a copy, never the store's own.
    ...(processing ? { processing: processing.processing } : {})
  };
  const unsent = deniedEvidenceKeys === undefined && rows.length > 0;
  return { summary, withheld: summary.truncated || unsent || (screened?.withheld ?? false) || (processing?.withheld ?? false) };
}

/**
 * How many checked rows lack a value for a field the set's own schema declares
 * required, and which fields.
 *
 * Only `required: true` counts: a field the schema leaves optional may be
 * absent from any row, and a field nobody declared is not Core's to demand. A
 * set whose schema could not be read is not checked at all, and says so by
 * checking no rows, rather than passing rows it never compared.
 */
function requiredValueCheck(set: AutomationStudioResultRecordSetInput): Pick<AutomationStudioResultRecordSetSummary, "rowsChecked" | "rowsMissingRequired" | "missingRequiredColumns"> {
  if (!set.schema) return { rowsChecked: 0, rowsMissingRequired: 0, missingRequiredColumns: [] };
  const required = set.schema.fields
    .filter((field) => field.required === true && (field.handling === undefined || field.handling === "include"))
    .map((field) => field.id);
  const checked = set.checkedRows ?? set.rows ?? [];
  const lacking = new Set<string>();
  let rowsMissingRequired = 0;
  for (const row of checked) {
    const missing = required.filter((id) => !carriesValue(row, id));
    if (missing.length === 0) continue;
    rowsMissingRequired += 1;
    for (const id of missing) lacking.add(id);
  }
  return {
    rowsChecked: checked.length,
    rowsMissingRequired,
    missingRequiredColumns: required.filter((id) => lacking.has(id))
  };
}

/**
 * Whether a stored row carries a value for a field: present, not null, and --
 * for a string -- not empty once its surrounding whitespace is set aside.
 */
function carriesValue(row: JsonObject, id: string): boolean {
  if (!Object.hasOwn(row, id)) return false;
  const value = row[id];
  if (value === null || value === undefined) return false;
  return typeof value !== "string" || value.trim().length > 0;
}

/**
 * Every row, cut to the columns the schema names and to nothing else. A
 * column whose id the domain denies is left out of every row, because the key
 * itself is what the declaration refuses; a value that carries a credential
 * shape anywhere inside it, or a denied key inside a nested value, becomes the
 * marker. Every other value is carried whole, nested values included.
 */
function screenedRows(rows: readonly JsonObject[], columns: readonly string[], deniedEvidenceKeys: readonly string[]): { rows: JsonObject[]; withheld: boolean } {
  const deniedColumns = new Set(columns.filter((column) => screenAutomationStudioLlmEvidence({ [column]: null }, deniedEvidenceKeys).deniedKey));
  let withheld = false;
  const screened = rows.map((row) => {
    const carried: JsonObject = {};
    for (const column of columns) {
      if (!Object.hasOwn(row, column)) continue;
      if (deniedColumns.has(column)) {
        withheld = true;
        continue;
      }
      const value = row[column]!;
      const found = screenAutomationStudioLlmEvidence(value, deniedEvidenceKeys);
      if (found.deniedKey || found.secretShaped || (typeof value === "number" && !Number.isFinite(value))) {
        carried[column] = WITHHELD_VALUE;
        withheld = true;
        continue;
      }
      carried[column] = value;
    }
    return carried;
  });
  return { rows: screened, withheld };
}

function safeCount(value: number | undefined): number {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : 0;
}
