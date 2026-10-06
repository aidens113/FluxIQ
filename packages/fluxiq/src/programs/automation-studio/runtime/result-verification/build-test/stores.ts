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
// with only routing nodes (a merge, a loop) between them. A record output is
// found by its shape, an object naming a `datasetId`, which is Core's own
// contract, not by a domain's parameter name. A read whose node writes none
// stores nothing here: a domain that derives a dataset itself when none is
// written does so as it dispatches, where Core cannot see its id.
//
// **The rows are the test's, screened as the judge's `readRows` are**
// (`./read-rows.ts`): a label from a denied column, or shaped like a credential
// or a locator, is said as withheld and still counts as a row, and is never
// called a repeat. A read that lists fewer rows than it returned says how many
// more (`rowsNotShown`); they count and have no label. Every row, every label
// (user rule: no caps). A `replace` clears what the dataset held before it,
// as the run's dataset store does (`storage/project/run-dataset-store.ts`).

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_RECORD_WRITE_MODES } from "../../../nodes/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioLocatorShapedText } from "../../llm/index.ts";
import type { AutomationStudioBuildTestStore } from "../contracts.ts";
import { AUTOMATION_STUDIO_BUILD_TEST_READ_ROWS_KEY, automationStudioBuildTestReadRows } from "./read-rows.ts";

/** What a label that may not be said reads as: the read-account's own word (`../read-account/alone-rows.ts`). */
const WITHHELD_LABEL = "(withheld)";

/** The nodes the plan writes between the steps' own nodes (`../../flow-bootstrap/authoring/draft-routing.ts`). */
const ROUTING_NODES: ReadonlySet<string> = new Set(["builtin.control.merge", "builtin.control.for-each"]);

type Filling = { dataset: string; writes: Array<{ step: number; writeMode: string }>; rows: number; labels: string[] };

/**
 * Each dataset the Flow would write, in the order its first writer runs, and
 * whether a label or a dataset's name was withheld.
 *
 * `steps` are the proposed steps, in order; `answers` gives what the test
 * observed of one, each answer as it came (one per pass of a repeated step).
 */
export function automationStudioBuildTestStores(input: {
  steps: readonly AutomationStudioFlowDraftStep[];
  nodes: readonly AutomationStudioFlowNode[];
  answers: (step: AutomationStudioFlowDraftStep) => readonly JsonValue[];
  deniedEvidenceKeys: readonly string[];
}): { stores: AutomationStudioBuildTestStore[]; withheld: boolean } {
  let withheld = false;
  const filled = new Map<string, Filling>();
  const nodeOf = stepNodes(input.steps, input.nodes);
  for (const step of input.steps) {
    const output = recordOutput(nodeOf.get(step));
    if (!output) continue;
    const unsayable = automationStudioLocatorShapedText(output.dataset);
    if (unsayable) withheld = true;
    const dataset = unsayable ? WITHHELD_LABEL : output.dataset;
    const filling = filled.get(dataset) ?? { dataset, writes: [], rows: 0, labels: [] };
    filled.set(dataset, filling);
    filling.writes.push({ step: step.position, writeMode: output.writeMode });
    // A step that replaces clears the dataset as each of its batches is written: every pass of a repeat is one.
    if (output.writeMode === "replace") clear(filling);
    for (const answer of input.answers(step)) {
      const read = readRows(answer, input.deniedEvidenceKeys);
      if (!read) continue;
      if (read.withheld) withheld = true;
      if (output.writeMode === "replace") clear(filling);
      filling.rows += read.labels.length + read.notShown;
      filling.labels.push(...read.labels);
    }
  }
  return { stores: [...filled.values()].map(store), withheld };
}

function clear(filling: Filling): void {
  filling.rows = 0;
  filling.labels = [];
}

function store(filling: Filling): AutomationStudioBuildTestStore {
  const modes = new Set(filling.writes.map((write) => write.writeMode));
  const writeMode = modes.size === 1 ? filling.writes[0]!.writeMode : filling.writes.map((write) => `${write.writeMode} at step ${write.step}`).join(", ");
  const repeated = repeats(filling.labels);
  return {
    dataset: filling.dataset,
    writeMode,
    steps: [...new Set(filling.writes.map((write) => write.step))],
    rows: filling.rows,
    labels: filling.labels,
    ...(repeated.length ? { repeated } : {})
  };
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

/** The record output a node writes: a parameter naming a dataset, its write mode the contract's default where it names none. */
function recordOutput(node: AutomationStudioFlowNode | undefined): { dataset: string; writeMode: string } | undefined {
  for (const value of Object.values(node?.parameterValues ?? {})) {
    if (!isObject(value) || typeof value.datasetId !== "string" || !value.datasetId.trim()) continue;
    const modes: readonly string[] = AUTOMATION_STUDIO_RECORD_WRITE_MODES;
    const writeMode = typeof value.writeMode === "string" && modes.includes(value.writeMode) ? value.writeMode : AUTOMATION_STUDIO_RECORD_WRITE_MODES[0];
    return { dataset: value.datasetId.trim(), writeMode };
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
