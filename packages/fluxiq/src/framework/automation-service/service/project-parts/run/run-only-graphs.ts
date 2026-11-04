// What a part run executes: a throwaway root that calls the part, and a copy of each
// saved graph made for this one run. Nothing here is stored or applied.
//
// The root is a real boundary, as a partial trial's is (`detached/subflow.ts`): the
// part's inputs cross it typed, its outputs come back by port id, and its success
// check is judged when its frame ends. Only the values given are bound, because a
// binding to a value the root never had fails the call before anything runs, and an
// optional input left out must take its declared default.
//
// In the copies a call step names the copy of the version it pins, by the id this run
// gave it, so a call goes to that version and never to whatever a Flow calls now. Each
// copy carries the marks a graph of a run's own topology carries, so the run's steps
// and acts read through the same code a trial's do (`../../candidate-trial/`).
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID } from "../../../../../components/automation/control-flow/index.ts";
import { automationNodeStateBinding } from "../../../../../components/automation/index.ts";
import type { AutomationStudioSubflowGraph, AutomationStudioSubflowGraphSource } from "../../../../../engine/automation/frames/index.ts";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioFlowArtifact } from "../../../../../flows/authoring/model/index.ts";
import type { AutomationStudioFlowNode } from "../../../../../flows/executable/graph/index.ts";
import { projectPartRunKey, type ProjectPartRunEntry } from "./closure.ts";

const START_NODE = "builtin.control.start";
const ROOT_CALL_NODE = "part-run.call";

export type ProjectPartRunOnlyGraphs = {
  root: AutomationStudioFlowArtifact;
  /** The copy of each saved version, the part itself first. */
  copies: AutomationStudioFlowArtifact[];
  source: AutomationStudioSubflowGraphSource;
  /** The copy a call to `subflowId` runs. */
  copyOf(subflowId: string): AutomationStudioFlowArtifact | undefined;
  /** A node of the root or any copy, by id. Two copies sharing an id are told apart as neither: a run never guesses which it reached. */
  nodeOf(nodeId: string): AutomationStudioFlowNode | undefined;
};

export function projectPartRunOnlyGraphs(input: { projectId: string; root: ProjectPartRunEntry; entries: ReadonlyMap<string, ProjectPartRunEntry>; givenInputs: readonly string[] }): ProjectPartRunOnlyGraphs {
  const rootKey = projectPartRunKey(input.root.card.partId, input.root.card.version);
  const flowId = `part-run.${input.root.card.partId}.v${input.root.card.version}`;
  const subflowIdOf = (key: string) => `part-run.subflow.${key}`;
  const copies = new Map([...input.entries].map(([key, entry]) => [subflowIdOf(key), copyOf(input.projectId, flowId, subflowIdOf(key), entry, subflowIdOf)]));
  const root = rootOf(input.projectId, flowId, input.root, subflowIdOf(rootKey), input.givenInputs);
  const graphs = new Map<string, AutomationStudioSubflowGraph>([...copies].map(([subflowId, artifact]) => [subflowId, {
    subflowId, artifact, graphRevision: null,
    graph: { schemaVersion: "0.1", flowId: artifact.flowId, ownerKind: "routine", ownerId: artifact.flowId, name: artifact.name, nodes: artifact.nodes, edges: artifact.edges, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt, ...(artifact.metadata ? { metadata: artifact.metadata } : {}) }
  }]));
  const nodes = new Map<string, AutomationStudioFlowNode | null>();
  for (const artifact of [root, ...copies.values()]) for (const node of artifact.nodes) nodes.set(node.id, nodes.has(node.id) ? null : node);
  return {
    root,
    copies: [...copies.values()],
    source: { load: async (subflowId) => graphs.get(subflowId) },
    copyOf: (subflowId) => copies.get(subflowId),
    nodeOf: (nodeId) => nodes.get(nodeId) ?? undefined
  };
}

function rootOf(projectId: string, flowId: string, part: ProjectPartRunEntry, subflowId: string, givenInputs: readonly string[]): AutomationStudioFlowArtifact {
  const blank = createBlankAutomationStudioFlowArtifact({ flowId, projectId, name: part.card.name, now: 0, metadata: { parentFlowId: flowId, partRun: true } });
  const inputs: Record<string, JsonValue> = Object.fromEntries(givenInputs.map((id) => [id, automationNodeStateBinding(id)]));
  const outputs: JsonObject = Object.fromEntries(part.card.outputs.map((port) => [port.id, port.id]));
  return {
    ...blank,
    interface: { inputs: part.card.inputs.map((port) => ({ id: port.id, name: port.name, valueType: { kind: "unknown" }, required: false })), outputs: [] },
    nodes: [
      { id: "part-run.start", definitionId: START_NODE, definitionVersion: "1.0.0", label: "Start" },
      { id: ROOT_CALL_NODE, definitionId: AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID, definitionVersion: "1.0.0", label: part.card.name, parameterValues: { subflowId, inputs, outputs } }
    ],
    edges: [{ id: "part-run.next", sourceNodeId: "part-run.start", sourcePortId: "success", targetNodeId: ROOT_CALL_NODE, targetPortId: "in" }]
  };
}

function copyOf(projectId: string, parentFlowId: string, subflowId: string, entry: ProjectPartRunEntry, subflowIdOf: (key: string) => string): AutomationStudioFlowArtifact {
  const { card, snapshot } = entry;
  const blank = createBlankAutomationStudioFlowArtifact({ flowId: `${subflowId}.graph`, projectId, name: card.name, now: 0, metadata: { ...structuredClone(snapshot.graph.metadata ?? {}), parentFlowId, parentSubflowId: subflowId, subflowGraph: true } });
  return {
    ...blank,
    ...(snapshot.graph.interface ? { interface: structuredClone(snapshot.graph.interface) } : {}),
    nodes: snapshot.graph.nodes.map((node) => {
      const pin = entry.calls.get(node.id);
      if (!pin) return structuredClone(node);
      const { part: _pin, ...parameters } = structuredClone(node.parameterValues ?? {});
      return { ...structuredClone(node), parameterValues: { ...parameters, subflowId: subflowIdOf(projectPartRunKey(pin.partId, pin.version)) } };
    }),
    edges: structuredClone(snapshot.graph.edges)
  };
}
