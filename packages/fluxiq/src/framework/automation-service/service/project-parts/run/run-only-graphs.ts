// What a part run executes: a throwaway root whose one step pins the part. The part and
// all it calls then run as any pinned call does (`./part-graph.ts`), through the same
// frame, boundary and ledger a Flow's step goes through. Nothing here is stored or applied.
//
// The root is a real boundary, as a partial trial's is (`detached/subflow.ts`): the
// part's inputs cross it typed, its outputs come back by port id, and its success
// check is judged when its frame ends. Only the values given are bound, because a
// binding to a value the root never had fails the call before anything runs, and an
// optional input left out must take its declared default.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID } from "../../../../../components/automation/control-flow/index.ts";
import { automationNodeStateBinding } from "../../../../../components/automation/index.ts";
import type { AutomationStudioSubflowGraphSource } from "../../../../../engine/automation/frames/index.ts";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioFlowArtifact } from "../../../../../flows/authoring/model/index.ts";
import type { AutomationStudioFlowNode } from "../../../../../flows/executable/graph/index.ts";
import type { ProjectPartRunEntry } from "./closure.ts";
import { projectPartRunGraphOf } from "./part-graph.ts";

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
  const flowId = `part-run.${input.root.card.partId}.v${input.root.card.version}`;
  const graphs = new Map([...input.entries.values()].map((entry) => {
    const made = projectPartRunGraphOf({ projectId: input.projectId, parentFlowId: flowId, entry });
    return [made.target.subflowId, made] as const;
  }));
  const root = rootOf(input.projectId, flowId, input.root, input.givenInputs);
  const copies = [...graphs.values()].map((made) => made.artifact);
  const nodes = new Map<string, AutomationStudioFlowNode | null>();
  for (const artifact of [root, ...copies]) for (const node of artifact.nodes) nodes.set(node.id, nodes.has(node.id) ? null : node);
  return {
    root,
    copies,
    source: { load: async (subflowId) => graphs.get(subflowId)?.target },
    copyOf: (subflowId) => graphs.get(subflowId)?.artifact,
    nodeOf: (nodeId) => nodes.get(nodeId) ?? undefined
  };
}

function rootOf(projectId: string, flowId: string, part: ProjectPartRunEntry, givenInputs: readonly string[]): AutomationStudioFlowArtifact {
  const blank = createBlankAutomationStudioFlowArtifact({ flowId, projectId, name: part.card.name, now: 0, metadata: { parentFlowId: flowId, partRun: true } });
  const inputs: Record<string, JsonValue> = Object.fromEntries(givenInputs.map((id) => [id, automationNodeStateBinding(id)]));
  const outputs: JsonObject = Object.fromEntries(part.card.outputs.map((port) => [port.id, port.id]));
  return {
    ...blank,
    interface: { inputs: part.card.inputs.map((port) => ({ id: port.id, name: port.name, valueType: { kind: "unknown" }, required: false })), outputs: [] },
    nodes: [
      { id: "part-run.start", definitionId: START_NODE, definitionVersion: "1.0.0", label: "Start" },
      { id: ROOT_CALL_NODE, definitionId: AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID, definitionVersion: "1.0.0", label: part.card.name, parameterValues: { part: { partId: part.card.partId, version: part.card.version }, inputs, outputs } }
    ],
    edges: [{ id: "part-run.next", sourceNodeId: "part-run.start", sourcePortId: "success", targetNodeId: ROOT_CALL_NODE, targetPortId: "in" }]
  };
}
