// One saved version as a graph of a run: what a pinned call step runs, whoever started
// the run (a part's own run, or a Flow whose step pins it). Nothing here is stored.
//
// **A call step of the version says what it pins.** A snapshot keeps its call steps as
// saved, naming a Subflow of the Flow they were saved from, and `part_calls` says which
// version each one was proven against. So each is written here as the pin it stands for,
// and goes to that version whatever its Flow's Subflow is now.
//
// The graph carries the marks a graph of a run's own topology carries, so its steps and
// acts read through the same code a trial's do (`../../candidate-trial/`), and `projectPart`,
// which is what its ownership is proved by (`../../runtime-session/subflow-graph-ownership.ts`).
import type { AutomationStudioSubflowGraph } from "../../../../../engine/automation/frames/index.ts";
import { automationStudioPinnedSubflowId } from "../../../../../engine/automation/frames/index.ts";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioFlowArtifact, type AutomationStudioFlowDocument } from "../../../../../flows/authoring/model/index.ts";
import type { ProjectPartRunEntry } from "./closure.ts";

export type ProjectPartRunGraph = { artifact: AutomationStudioFlowArtifact; target: AutomationStudioSubflowGraph };

export function projectPartRunGraphOf(input: { projectId: string; parentFlowId: string; entry: ProjectPartRunEntry }): ProjectPartRunGraph {
  const { entry, parentFlowId, projectId } = input;
  const { card, snapshot, source } = entry;
  const pin = { partId: card.partId, version: card.version };
  const subflowId = automationStudioPinnedSubflowId(pin);
  const blank = createBlankAutomationStudioFlowArtifact({ flowId: source.graphFlowId, projectId, name: card.name, now: 0, metadata: { ...structuredClone(snapshot.graph.metadata ?? {}), parentFlowId, parentSubflowId: subflowId, subflowGraph: true, projectPart: pin } });
  const artifact: AutomationStudioFlowArtifact = {
    ...blank,
    ...(snapshot.graph.interface ? { interface: structuredClone(snapshot.graph.interface) } : {}),
    nodes: snapshot.graph.nodes.map((node) => {
      const called = entry.calls.get(node.id);
      if (!called) return structuredClone(node);
      const { subflowId: _sibling, ...parameters } = structuredClone(node.parameterValues ?? {});
      return { ...structuredClone(node), parameterValues: { ...parameters, part: { partId: called.partId, version: called.version } } };
    }),
    edges: structuredClone(snapshot.graph.edges)
  };
  const graph: AutomationStudioFlowDocument = { schemaVersion: "0.1", flowId: artifact.flowId, ownerKind: "routine", ownerId: artifact.flowId, name: artifact.name, nodes: artifact.nodes, edges: artifact.edges, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt, ...(artifact.metadata ? { metadata: artifact.metadata } : {}) };
  return { artifact, target: { subflowId, artifact, graphRevision: source.revision, graph } };
}
