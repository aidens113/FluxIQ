// The Router-selected Subflow as the run's first frame (state-aware recovery
// plan, C1): its Subflow record's mappings applied at the boundary, and the
// automation's other Subflow graphs offered to its Call Subflow nodes.

import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact, AutomationStudioFlowSubflow } from "../../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace } from "../../executor/index.ts";
import type { AutomationStudioSubflowGraph, AutomationStudioSubflowGraphSource } from "../../executor/frames/index.ts";
import { automationStudioFlowGraphVersion, type AutomationStudioFlowGraphVersion } from "../../flow-version/index.ts";
import { automationStudioSubflowGraphIsOwned } from "./subflow-graph-ownership.ts";

/** What the run session reads back from the first frame once the run has ended. */
export type AutomationStudioRouterSubflowFrame = {
  /** The trace with the Subflow record's `outputMapping` applied to the values it exposes. */
  withOutputs(trace: AutomationStudioGraphExecutionTrace): AutomationStudioGraphExecutionTrace;
  /** Every Subflow graph a Call Subflow node ran, at the revision it ran, in the order first run. */
  calledVersions(trace: AutomationStudioGraphExecutionTrace): AutomationStudioFlowGraphVersion[];
};

/**
 * Binds `graphOptions` to the Subflow the Router selected, in place, so every
 * execution of it in this run -- the first, and a re-run after a repair, which
 * is handed the same options -- runs as the same frame:
 * - the record's `inputMapping` fills each Subflow input from the Flow input it
 *   names (the Flow's own inputs stay, so nothing that read them before stops);
 * - `currentSubflowId` names the Subflow, which is the first frame's;
 * - `subflowGraphs` offers the automation's Subflow graphs to Call Subflow
 *   nodes, each read and materialised as the selected one was (`loadGraph`) and
 *   run only when it proves it belongs to this Flow and that Subflow.
 *
 * Without a selected, owned graph it binds nothing and reads nothing back.
 */
export function automationStudioBindRouterSubflowFrame(input: {
  graphOptions: AutomationStudioGraphExecutionOptions;
  selected: AutomationStudioFlowSubflow | null | undefined;
  /** Whether the selected Subflow's graph was loaded and proved its ownership. */
  selectedIsOwned: boolean;
  subflows: readonly AutomationStudioFlowSubflow[];
  parentFlowId: string;
  loadGraph: (graphFlowId: string) => Promise<AutomationStudioFlowArtifact | undefined>;
  representationOf: (graph: AutomationStudioFlowArtifact) => string | undefined;
}): AutomationStudioRouterSubflowFrame {
  const { graphOptions, selected } = input;
  if (!selected || !input.selectedIsOwned) return { withOutputs: (trace) => trace, calledVersions: () => [] };
  const flowInputs: Record<string, JsonValue> = { ...(graphOptions.inputs ?? {}) };
  const mapped: Record<string, JsonValue> = {};
  for (const mapping of selected.inputMapping ?? []) {
    const value = flowInputs[mapping.flowInputId];
    if (value !== undefined) mapped[mapping.subflowInputId] = value;
  }
  graphOptions.inputs = { ...flowInputs, ...mapped };
  graphOptions.currentSubflowId = selected.subflowId;
  graphOptions.subflowGraphs = automationStudioSubflowGraphSource(input);
  return {
    withOutputs: (trace) => {
      const exposed: Record<string, JsonValue> = {};
      for (const mapping of selected.outputMapping ?? []) {
        const value = trace.values[mapping.subflowOutputId];
        if (value !== undefined) exposed[mapping.flowOutputId] = value;
      }
      return Object.keys(exposed).length ? { ...trace, values: { ...trace.values, ...exposed } } : trace;
    },
    calledVersions: (trace) => calledSubflowVersions(trace)
  };
}

// Each graph is read once per run, so every call to one Subflow runs the same revision.
function automationStudioSubflowGraphSource(input: {
  subflows: readonly AutomationStudioFlowSubflow[];
  parentFlowId: string;
  loadGraph: (graphFlowId: string) => Promise<AutomationStudioFlowArtifact | undefined>;
  representationOf: (graph: AutomationStudioFlowArtifact) => string | undefined;
}): AutomationStudioSubflowGraphSource {
  const loaded = new Map<string, Promise<AutomationStudioSubflowGraph | undefined>>();
  const read = async (record: AutomationStudioFlowSubflow): Promise<AutomationStudioSubflowGraph | undefined> => {
    const artifact = record.graphFlowId ? await input.loadGraph(record.graphFlowId) : undefined;
    if (!artifact || !automationStudioSubflowGraphIsOwned(record, artifact, input.parentFlowId, input.representationOf)) return undefined;
    return {
      subflowId: record.subflowId,
      graph: { schemaVersion: "0.1", flowId: artifact.flowId, ownerKind: "routine", ownerId: artifact.flowId, name: artifact.name, nodes: artifact.nodes, edges: artifact.edges, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt, ...(artifact.metadata ? { metadata: artifact.metadata } : {}) },
      graphRevision: automationStudioFlowGraphVersion({ flow: artifact }).revision,
      artifact
    };
  };
  const load = (subflowId: string): Promise<AutomationStudioSubflowGraph | undefined> => {
    const record = input.subflows.find((subflow) => subflow.subflowId === subflowId);
    if (!record) return Promise.resolve(undefined);
    const known = loaded.get(subflowId) ?? read(record);
    loaded.set(subflowId, known);
    return known;
  };
  return {
    load,
    recovery: async () => {
      const record = input.subflows.find((subflow) => subflow.role === "recovery");
      return record ? await load(record.subflowId) : undefined;
    }
  };
}

function calledSubflowVersions(trace: AutomationStudioGraphExecutionTrace): AutomationStudioFlowGraphVersion[] {
  const versions: AutomationStudioFlowGraphVersion[] = [];
  const visit = (visited: AutomationStudioGraphExecutionTrace) => {
    for (const attempt of visited.attempts) {
      const target = attempt.subflowTarget;
      if (target) versions.push({ graphFlowId: target.graphFlowId, revision: target.graphRevision, subflowId: target.subflowId });
      if (attempt.childTrace) visit(attempt.childTrace);
    }
  };
  visit(trace);
  return versions;
}
