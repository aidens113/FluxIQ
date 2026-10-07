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

import type { AutomationStudioRecordSchema, AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../model/index.ts";
import { screenAutomationStudioLlmEvidence } from "../llm/index.ts";
import { automationStudioScreenedNodeParameters } from "../recovery/repair-context/index.ts";
import type {
  AutomationStudioResultEndView,
  AutomationStudioResultFlowStepSummary,
  AutomationStudioResultRecordSetSummary,
  AutomationStudioRunResultSummary
} from "./contracts.ts";
import { automationStudioResultReadAccounts } from "./read-account/index.ts";
import { automationStudioResultStepChanges } from "./step-changes.ts";

/** Stands in, in a row, for a value shaped like a credential or carrying a denied key. */
const WITHHELD_VALUE = "[withheld]";

/** One traced attempt, as far as this reads it: its diff, and the domain's view of the page before and after it. */
type TracedAttempt = {
  nodeId: string;
  stateRefs?: { stateDiff?: JsonObject; beforeAction?: { summary?: JsonObject | undefined }; afterAction?: { summary?: JsonObject | undefined } } | undefined;
};

// `AutomationStudioResultEndView` and the summary's `endView` live in
// `./contracts.ts`; re-exported here for the callers that read them from here.
export type { AutomationStudioResultEndView } from "./contracts.ts";

/** @deprecated The summary itself now carries `endView` (`./contracts.ts`); kept for the callers that still name this. */
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
};

/**
 * The screened summary of what a run produced, whole.
 *
 * `withheld` is true whenever anything was screened out or the store itself
 * reported the set truncated, so the model is never shown a partial picture
 * that reads as a whole one.
 */
export function summarizeAutomationStudioRunResult(input: AutomationStudioRunResultSummaryInput): AutomationStudioRunResultSummaryWithEndView {
  const totalRecordCount = input.recordSets.reduce((total, set) => total + safeCount(set.summary.recordCount), 0);
  const totalRefusedCount = input.recordSets.reduce((total, set) => total + safeCount(set.summary.invalidCount), 0);
  let withheld = false;
  const recordSets: AutomationStudioResultRecordSetSummary[] = [];
  for (const set of input.recordSets) {
    const summarized = summarizedRecordSet(set, input.deniedEvidenceKeys);
    if (summarized.withheld) withheld = true;
    recordSets.push(summarized.summary);
  }
  const flowNodes = input.flowEdges ? inRunOrder(input.flowNodes ?? [], input.flowEdges) : input.flowNodes ?? [];
  const changes = automationStudioResultStepChanges(input.sessionAttempts, input.deniedEvidenceKeys);
  if (changes.withheld) withheld = true;
  const flowShape = flowNodes.map((node) => {
    const changed = changes.byNode.get(node.id);
    return { ...step(node, input.deniedEvidenceKeys), ...(changed ? { changed } : {}) };
  });
  const ended = input.endView ? automationStudioResultEndView(input.endView, input.deniedEvidenceKeys) : undefined;
  if (ended?.withheld || input.endViewUnreadable !== undefined) withheld = true;
  const begun = startedOn(input.sessionAttempts, input.observedStateKeys ?? viewKeysOf(input.endView));
  const started = begun ? automationStudioResultEndView(begun, input.deniedEvidenceKeys) : undefined;
  if (started?.withheld) withheld = true;
  // How each list read went (`read-account/`): pages, why paging stopped, and
  // what each condition rejected, so a judge is not shown a step's name alone.
  const accounted = automationStudioResultReadAccounts({ actionAttempts: input.actionAttempts, flowNodes, deniedEvidenceKeys: input.deniedEvidenceKeys });
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount,
    totalRefusedCount,
    totalRowsMissingRequired: recordSets.reduce((total, set) => total + set.rowsMissingRequired, 0),
    recordSetCount: input.recordSets.length,
    recordSets,
    ...(accounted.reads.length ? { reads: accounted.reads } : {}),
    flowShape,
    withheld,
    ...(ended?.endView ? { endView: ended.endView } : {}),
    ...(started?.endView ? { startView: started.endView } : {})
  };
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
function step(node: AutomationStudioFlowNode, deniedEvidenceKeys: readonly string[] | undefined): AutomationStudioResultFlowStepSummary {
  const named: AutomationStudioResultFlowStepSummary = {
    nodeId: node.id,
    definitionId: node.definitionId,
    ...(node.label ? { label: node.label } : {})
  };
  if (deniedEvidenceKeys === undefined || !node.parameterValues || Object.keys(node.parameterValues).length === 0) return named;
  const screened = automationStudioScreenedNodeParameters(node.parameterValues, deniedEvidenceKeys);
  return { ...named, parameters: screened.values, ...(screened.withheld.length ? { parametersWithheld: screened.withheld } : {}) };
}

function summarizedRecordSet(
  set: AutomationStudioResultRecordSetInput,
  deniedEvidenceKeys: readonly string[] | undefined
): { summary: AutomationStudioResultRecordSetSummary; withheld: boolean } {
  const columns = (set.schema?.fields ?? []).map((field) => field.id);
  const rows = set.rows ?? [];
  const screened = deniedEvidenceKeys === undefined ? undefined : screenedRows(rows, columns, deniedEvidenceKeys);
  const summary: AutomationStudioResultRecordSetSummary = {
    datasetId: set.summary.datasetId,
    ...(set.summary.label ? { label: set.summary.label } : {}),
    recordCount: safeCount(set.summary.recordCount),
    refusedCount: safeCount(set.summary.invalidCount),
    truncated: set.summary.truncated === true,
    columns,
    columnsWithheld: false,
    ...requiredValueCheck(set),
    ...(screened && screened.rows.length ? { sampleRows: screened.rows } : {})
  };
  const unsent = deniedEvidenceKeys === undefined && rows.length > 0;
  return { summary, withheld: summary.truncated || unsent || (screened?.withheld ?? false) };
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
