// What the Flow a build proposes would store, as its test's reads filled it
// (t274-c3).
//
// **Why.** A test stores nothing, so its summary carries no record set, and the
// judge of live run `run-muw60j7c-bb7c9a62` (Stage 6, C-3) took that at its
// word: "the test stored nothing ..., so the record set is empty". Its Flow
// held two list reads, draft steps 6 and 7, both appending to one dataset: 20
// unfiltered page-1 rows, then 10 filtered rows. The run stored 30, 3 of them
// twice. The test had replayed both reads and named every row, yet neither
// judge put the two together, and both said yes. So the summary says what the
// Flow would store: per dataset, the steps that write it and the rows their
// reads returned in this test, in order, with the labels stored twice.
//
// **Which steps store, and where, is the assembled Flow's to say.** A step
// stores when the node it became writes a record output, the dataset that
// output names (`../../flow-bootstrap/authoring/record-output.ts` fills one in
// for a model that half wrote it). A step's node is found as
// `llm/node-tools/draft-from-flow.ts` finds it: the plan writes the proposed
// steps' nodes in step order, each under its step's action as its definition,
// with only routing nodes (a merge, a loop, a do-while's Repeat) between them.
// A record output is found by its shape, an object naming a `datasetId`, which
// is Core's own contract, not by a domain's parameter name. A read whose node
// writes none stores nothing here: a domain that derives a dataset itself when
// none is written does so as it dispatches, where Core cannot see its id.
//
// **What it is judged on is the answer, not the appends (read-list design
// 5.1).** A list read reads one page, and a Flow pages with a do-while (Merge
// -> Repeat -> read -> Next page): every pass appends one batch to the read's
// dataset, and the run's end makes the dataset's answer with the one function
// a finished run's end calls (`processAutomationStudioRecordRows`): each row
// once -- the whole row its identity unless the read names a dedupe key --
// then the record output's own `process` (where, sort, limit, columns). Page 2
// opening with page 1's last row is no row stored twice. The rows are those the
// test's reads stored (each observation's internal `records`, never its
// evidence, `../../llm/node-tools/replay-span.ts`), collected per dataset in
// capture order -- the order the test's answers came, so pass order -- each
// answer one batch. A `replace` clears what the dataset held before each batch
// it writes, as the run's dataset store does (`storage/project/run-dataset-store.ts`).
//
// **The labels are the test's, screened as the judge's `readRows` are**
// (`./read-rows.ts`): a label from a denied column, or shaped like a credential
// or a locator, is said as withheld and still counts as a row, and is never
// called a repeat. Label n of a read's `readRows.rows` names record n of that
// answer when their counts match; an answer row whose read named none counts
// and has no label. Every row, every label (user rule: no caps).
//
// **Labels alone cannot make the answer**: two rows with one label may differ
// in every other column. A read that named its rows but sent no records -- a
// host older than the records, or a read only checked -- leaves its dataset's
// answer the collected rows as they came, with `removed` absent, as before
// 5.1. A read that lists fewer rows than it returned says how many more
// (`rowsNotShown`); they count and have no label.

import {
  parseAutomationStudioRecordOutput,
  processAutomationStudioRecordRows,
  type AutomationStudioRecordCollectedRow,
  type AutomationStudioRecordOutput,
  type AutomationStudioRecordProcessing
} from "@fluxiq/contracts/automation-studio";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_RECORD_WRITE_MODES } from "../../../nodes/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioLocatorShapedText } from "../../llm/index.ts";
import type { AutomationStudioBuildTestStore } from "../contracts.ts";
import { AUTOMATION_STUDIO_BUILD_TEST_READ_ROWS_KEY, automationStudioBuildTestReadRows } from "./read-rows.ts";

/** What a label that may not be said reads as: the read-account's own word (`../read-account/alone-rows.ts`). */
const WITHHELD_LABEL = "(withheld)";

/**
 * The nodes the plan writes between the steps' own nodes
 * (`../../flow-bootstrap/authoring/draft-routing.ts`). A do-while's Repeat is
 * one: without it every step from the loop's read on would have no node.
 */
const ROUTING_NODES: ReadonlySet<string> = new Set(["builtin.control.merge", "builtin.control.for-each", "builtin.control.repeat"]);

/** The records path a record output is parsed with where its node names none: Core's capture key. Where the rows sit is not what the answer needs. */
const CAPTURED_RECORDS_PATH = "records";

/** Where an answer row's place among the collected rows rides through the processing: a key no column has, which a row's spread keeps. */
const COLLECTED_AT = Symbol("collected at");

/** One answer the test observed of a step: `at`, its place among every answer of the test; `records`, the rows its read stored. */
export type AutomationStudioBuildTestStoreAnswer = { at: number; evidence: JsonValue; records?: readonly JsonObject[] | undefined };

/** One collected row: its stored values when the read sent them, its screened label when it named one. */
type Collected = { values?: JsonObject; label?: string; nodeId: string; batch: string };

type Filling = {
  dataset: string;
  writes: Array<{ step: number; writeMode: string }>;
  /** The first writer's record output, parsed: its schema and `process` make the answer. Absent when it does not parse. */
  output?: AutomationStudioRecordOutput;
  passes: number;
  rows: Collected[];
  /** A read named its rows without sending them: the answer cannot be made (see the header). */
  labelsOnly: boolean;
};

type Batch = { answer: AutomationStudioBuildTestStoreAnswer; filling: Filling; writeMode: string; nodeId: string };

/**
 * Each dataset the Flow would write, in the order its first writer runs, and
 * whether a label or a dataset's name was withheld.
 *
 * `steps` are the proposed steps, in order; `answers` gives what the test
 * observed of one, each answer as it came (one per pass of a repeated step).
 * `now` is what relative dates in a sort or a condition are measured back from.
 */
export function automationStudioBuildTestStores(input: {
  steps: readonly AutomationStudioFlowDraftStep[];
  nodes: readonly AutomationStudioFlowNode[];
  answers: (step: AutomationStudioFlowDraftStep) => readonly AutomationStudioBuildTestStoreAnswer[];
  deniedEvidenceKeys: readonly string[];
  now?: number | undefined;
}): { stores: AutomationStudioBuildTestStore[]; withheld: boolean } {
  let withheld = false;
  const filled = new Map<string, Filling>();
  const batches: Batch[] = [];
  const nodeOf = stepNodes(input.steps, input.nodes);
  for (const step of input.steps) {
    const node = nodeOf.get(step);
    const output = recordOutput(node);
    if (!node || !output) continue;
    const unsayable = automationStudioLocatorShapedText(output.dataset);
    if (unsayable) withheld = true;
    const dataset = unsayable ? WITHHELD_LABEL : output.dataset;
    const filling: Filling = filled.get(dataset) ?? { dataset, writes: [], ...(output.parsed ? { output: output.parsed } : {}), passes: 0, rows: [], labelsOnly: false };
    filled.set(dataset, filling);
    filling.writes.push({ step: step.position, writeMode: output.writeMode });
    for (const answer of input.answers(step)) batches.push({ answer, filling, writeMode: output.writeMode, nodeId: node.id });
  }
  // Capture order: the order the test's answers came, so a loop's passes in pass order (see the header).
  for (const batch of batches.sort((a, b) => a.answer.at - b.answer.at)) {
    if (collect(batch, input.deniedEvidenceKeys)) withheld = true;
  }
  const now = input.now ?? Date.now();
  return { stores: [...filled.values()].map((filling) => store(filling, now)), withheld };
}

/** One answer written to its dataset as one batch; whether a label was withheld. An answer that names and sends no rows writes nothing. */
function collect({ answer, filling, writeMode, nodeId }: Batch, deniedKeys: readonly string[]): boolean {
  const read = readRows(answer.evidence, deniedKeys);
  const records = answer.records;
  if (!read && !records) return false;
  // A replacing step clears the dataset as each of its batches is written: every pass of a repeat is one.
  if (writeMode === "replace") filling.rows = [];
  filling.passes += 1;
  const batch = `${answer.at}`;
  if (records) {
    // Label n names record n only when the read named every row it stored.
    const named = read && read.notShown === 0 && read.labels.length === records.length ? read.labels : undefined;
    filling.rows.push(...records.map((values, index): Collected => ({ values, nodeId, batch, ...(named ? { label: named[index]! } : {}) })));
  } else if (read) {
    filling.labelsOnly = true;
    filling.rows.push(...read.labels.map((label): Collected => ({ label, nodeId, batch })), ...Array.from({ length: read.notShown }, (): Collected => ({ nodeId, batch })));
  }
  return read?.withheld === true;
}

function store(filling: Filling, now: number): AutomationStudioBuildTestStore {
  const modes = new Set(filling.writes.map((write) => write.writeMode));
  const writeMode = modes.size === 1 ? filling.writes[0]!.writeMode : filling.writes.map((write) => `${write.writeMode} at step ${write.step}`).join(", ");
  const made = filling.labelsOnly || !filling.output ? undefined : answerOf(filling.rows, filling.output, now);
  const kept = made?.rows ?? filling.rows;
  const labels = kept.flatMap((row) => row.label === undefined ? [] : [row.label]);
  const repeated = repeats(labels);
  return {
    dataset: filling.dataset,
    writeMode,
    steps: [...new Set(filling.writes.map((write) => write.step))],
    passes: filling.passes,
    collected: filling.rows.length,
    answer: { rows: kept.length, labels },
    ...(made ? { removed: made.removed } : {}),
    ...(filling.rows.length > 0 && kept.length === 0 ? { keptNone: true as const } : {}),
    ...(repeated.length ? { repeated } : {})
  };
}

/**
 * The collected rows the run's end would keep, in answer order, made by the
 * shared function, and what it left out. Each row's place rides through it
 * under a key no column has. `columns` only shapes the answer's rows, which a
 * count and labels do not need, and would drop that key: it is taken off, and
 * the whole-row key it narrows kept as the dedupe key it stands for.
 */
function answerOf(rows: readonly Collected[], output: AutomationStudioRecordOutput, now: number): { rows: Collected[]; removed: NonNullable<AutomationStudioBuildTestStore["removed"]> } {
  const collected: AutomationStudioRecordCollectedRow[] = rows.map((row, at) => ({ values: { ...row.values, [COLLECTED_AT]: at }, nodeId: row.nodeId, batchKey: row.batch }));
  const made = processAutomationStudioRecordRows({ rows: collected, schema: output.schema, ...(output.process ? { process: withoutColumns(output.process) } : {}), now });
  const kept = made.rows.flatMap((row) => {
    const at: unknown = (row as { [COLLECTED_AT]?: unknown })[COLLECTED_AT];
    const found = typeof at === "number" ? rows[at] : undefined;
    return found ? [found] : [];
  });
  return { rows: kept, removed: { duplicates: made.account.duplicates, filteredOut: made.account.filteredOut, cut: made.account.cut } };
}

/** The declaration without `columns`, the whole-row key they narrowed kept where it was the dedupe key: the same rows, in the same order. */
function withoutColumns(process: AutomationStudioRecordProcessing): AutomationStudioRecordProcessing {
  const { columns, ...rest } = process;
  if (columns === undefined) return process;
  return rest.dedupe === undefined ? { ...rest, dedupe: { by: [...columns] } } : rest;
}

/** The labels seen more than once, each once, in the order first seen; never the withheld word. */
function repeats(labels: readonly string[]): string[] {
  const seen = new Set<string>();
  const again = new Set<string>();
  for (const label of labels) {
    if (label === WITHHELD_LABEL) continue;
    if (seen.has(label)) again.add(label);
    seen.add(label);
  }
  return [...again];
}

/**
 * The node each proposed step became: the next node whose definition is the
 * step's action, past routing nodes only. A step whose node is not where the
 * plan's order puts it ends the reading, as in `draft-from-flow.ts`: it and
 * every step after it are given no node rather than another step's.
 */
function stepNodes(steps: readonly AutomationStudioFlowDraftStep[], nodes: readonly AutomationStudioFlowNode[]): Map<AutomationStudioFlowDraftStep, AutomationStudioFlowNode> {
  const found = new Map<AutomationStudioFlowDraftStep, AutomationStudioFlowNode>();
  let at = 0;
  for (const step of steps) {
    while (at < nodes.length && nodes[at]!.definitionId !== step.actionId && ROUTING_NODES.has(nodes[at]!.definitionId)) at += 1;
    const node = nodes[at];
    if (node?.definitionId !== step.actionId) break;
    found.set(step, node);
    at += 1;
  }
  return found;
}

/**
 * The record output a node writes: a parameter naming a dataset, its write
 * mode the contract's default where it names none, and that output parsed by
 * Core's own parser for its schema and `process` (with Core's capture key as
 * its records path where it names none). Nothing parsed for one that does not
 * parse: its rows are still counted, and its answer is the collected rows.
 */
function recordOutput(node: AutomationStudioFlowNode | undefined): { dataset: string; writeMode: string; parsed?: AutomationStudioRecordOutput } | undefined {
  for (const value of Object.values(node?.parameterValues ?? {})) {
    if (!isObject(value) || typeof value.datasetId !== "string" || !value.datasetId.trim()) continue;
    const modes: readonly string[] = AUTOMATION_STUDIO_RECORD_WRITE_MODES;
    const writeMode = typeof value.writeMode === "string" && modes.includes(value.writeMode) ? value.writeMode : AUTOMATION_STUDIO_RECORD_WRITE_MODES[0];
    const parsed = parseAutomationStudioRecordOutput({ recordsPath: CAPTURED_RECORDS_PATH, ...value, writeMode });
    return { dataset: value.datasetId.trim(), writeMode, ...(parsed.ok ? { parsed: parsed.output } : {}) };
  }
  return undefined;
}

/** One answer's rows, screened by `./read-rows.ts`, a locator-shaped label withheld; nothing when the answer names no rows. */
function readRows(answer: JsonValue, deniedKeys: readonly string[]): { labels: string[]; notShown: number; withheld: boolean } | undefined {
  const screened = automationStudioBuildTestReadRows(answer, deniedKeys);
  const sent = isObject(screened.value) ? screened.value[AUTOMATION_STUDIO_BUILD_TEST_READ_ROWS_KEY] : undefined;
  if (!isObject(sent) || !Array.isArray(sent.rows)) return undefined;
  let withheld = screened.withheld;
  const labels = sent.rows.flatMap((label) => {
    if (typeof label !== "string") return [];
    if (!automationStudioLocatorShapedText(label)) return [label];
    withheld = true;
    return [WITHHELD_LABEL];
  });
  const notShown = typeof sent.rowsNotShown === "number" ? sent.rowsNotShown : 0;
  return { labels, notShown, withheld };
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
