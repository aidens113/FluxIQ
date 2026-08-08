import type {
  AutomationStudioFlowDocument,
  AutomationStudioProjectArtifacts,
  AutomationStudioRoutineArtifact,
  AutomationStudioTaskArtifact
} from "./artifacts.ts";
import type { AutomationStudioFlowArtifact, AutomationStudioFlowScope } from "./flows.ts";

export type AutomationStudioFlowCatalogEntry = {
  flow: AutomationStudioFlowArtifact;
  source: "canonical" | "legacy_task" | "legacy_routine";
  readOnly: boolean;
  legacyArtifactId?: string;
  legacyFlowId?: string;
};

export type ResolveAutomationStudioFlowCatalogInput = {
  projectId: string;
  scope: AutomationStudioFlowScope;
  canonicalFlows?: AutomationStudioFlowArtifact[];
  legacyArtifacts: AutomationStudioProjectArtifacts;
};

/**
 * Presents legacy task/routine artifacts as read-only migrated Flow entries.
 *
 * This is deliberately a pure adapter. It neither persists canonical Flows nor
 * changes the source artifacts, so callers can safely use it before the
 * explicit storage migration introduced in the next slice.
 */
export function resolveAutomationStudioFlowCatalog(input: ResolveAutomationStudioFlowCatalogInput): AutomationStudioFlowCatalogEntry[] {
  const entries: AutomationStudioFlowCatalogEntry[] = [];
  const ids = new Set<string>();
  for (const flow of input.canonicalFlows ?? []) {
    if (flow.projectId !== input.projectId || ids.has(flow.flowId)) continue;
    ids.add(flow.flowId);
    entries.push({ flow, source: "canonical", readOnly: false });
  }

  for (const task of input.legacyArtifacts.tasks) {
    const sourceFlow = findTaskFlow(task, input.legacyArtifacts.flows);
    const flow = adaptLegacyTaskToAutomationStudioFlow({
      projectId: input.projectId,
      scope: input.scope,
      task,
      ...(sourceFlow ? { sourceFlow } : {}),
      flowId: uniqueLegacyFlowId(`legacy.task.${task.taskId}`, ids)
    });
    ids.add(flow.flowId);
    entries.push({
      flow,
      source: "legacy_task",
      readOnly: true,
      legacyArtifactId: task.taskId,
      ...(sourceFlow ? { legacyFlowId: sourceFlow.flowId } : {})
    });
  }

  for (const routine of input.legacyArtifacts.routines) {
    const sourceFlow = findRoutineFlow(routine, input.legacyArtifacts.flows);
    const flow = adaptLegacyRoutineToAutomationStudioFlow({
      projectId: input.projectId,
      scope: input.scope,
      routine,
      ...(sourceFlow ? { sourceFlow } : {}),
      flowId: uniqueLegacyFlowId(`legacy.routine.${routine.routineId}`, ids)
    });
    ids.add(flow.flowId);
    entries.push({
      flow,
      source: "legacy_routine",
      readOnly: true,
      legacyArtifactId: routine.routineId,
      ...(sourceFlow ? { legacyFlowId: sourceFlow.flowId } : {})
    });
  }

  return entries;
}

export function adaptLegacyTaskToAutomationStudioFlow(input: {
  projectId: string;
  scope: AutomationStudioFlowScope;
  task: AutomationStudioTaskArtifact;
  sourceFlow?: AutomationStudioFlowDocument;
  flowId?: string;
}): AutomationStudioFlowArtifact {
  const { task, sourceFlow } = input;
  const nodes = cloneNodes(sourceFlow?.nodes ?? task.graph?.nodes ?? []);
  return {
    schemaVersion: "0.1",
    flowId: input.flowId ?? legacyFlowId("task", task.taskId),
    projectId: input.projectId,
    name: task.name,
    ...(task.description !== undefined ? { description: task.description } : {}),
    scope: input.scope,
    visibility: "private",
    origin: "migrated",
    source: { mode: "visual" },
    interface: { inputs: [], outputs: [] },
    errors: [],
    variables: [],
    nodes,
    edges: cloneEdges(sourceFlow?.edges ?? task.graph?.edges ?? []),
    ...(nodes.length ? { regions: [{ id: `region.policy.${task.taskId}`, name: task.name, kind: "policy", nodeIds: nodes.map((node) => node.id), entryPorts: [{ id: "in", name: "In", valueType: { kind: "unknown" } }], exitPorts: [{ id: "success", name: "Success", valueType: { kind: "unknown" } }, { id: "failed", name: "Failed", valueType: { kind: "unknown" } }], metadata: { policyId: task.taskId, migrated: true } }] } : {}),
    publication: { status: "draft" },
    evidenceReferences: task.recordingIds.map((recordingId) => ({ layer: "raw_recording", artifactId: recordingId, relationship: "legacy_task_recording" })),
    legacyProvenance: {
      kind: "task",
      artifactId: task.taskId,
      ...(sourceFlow ? { flowId: sourceFlow.flowId } : task.graph ? { flowId: task.graph.flowId } : {})
    },
    createdAt: task.createdAt,
    updatedAt: Math.max(task.updatedAt, sourceFlow?.updatedAt ?? task.graph?.updatedAt ?? task.updatedAt),
    metadata: {
      ...(task.metadata ?? {}),
      legacy: true,
      legacyKind: "task",
      legacyArtifactId: task.taskId,
      ...(task.signalRegistryId ? { signalRegistryId: task.signalRegistryId } : {})
    }
  };
}

export function adaptLegacyRoutineToAutomationStudioFlow(input: {
  projectId: string;
  scope: AutomationStudioFlowScope;
  routine: AutomationStudioRoutineArtifact;
  sourceFlow?: AutomationStudioFlowDocument;
  flowId?: string;
}): AutomationStudioFlowArtifact {
  const { routine, sourceFlow } = input;
  const nodes = cloneNodes(sourceFlow?.nodes ?? []);
  return {
    schemaVersion: "0.1",
    flowId: input.flowId ?? legacyFlowId("routine", routine.routineId),
    projectId: input.projectId,
    name: routine.name,
    ...(routine.description !== undefined ? { description: routine.description } : {}),
    scope: input.scope,
    visibility: "private",
    origin: "migrated",
    source: { mode: "visual" },
    interface: { inputs: [], outputs: [] },
    errors: [],
    variables: [],
    nodes,
    edges: cloneEdges(sourceFlow?.edges ?? []),
    ...(nodes.length ? { regions: [{ id: `region.deterministic.${routine.routineId}`, name: routine.name, kind: "deterministic", nodeIds: nodes.map((node) => node.id), entryPorts: [{ id: "in", name: "In", valueType: { kind: "unknown" } }], exitPorts: [{ id: "success", name: "Success", valueType: { kind: "unknown" } }, { id: "failed", name: "Failed", valueType: { kind: "unknown" } }], metadata: { migrated: true } }] } : {}),
    publication: { status: "draft" },
    legacyProvenance: {
      kind: "routine",
      artifactId: routine.routineId,
      ...(sourceFlow ? { flowId: sourceFlow.flowId } : {})
    },
    createdAt: routine.createdAt,
    updatedAt: Math.max(routine.updatedAt, sourceFlow?.updatedAt ?? routine.updatedAt),
    metadata: {
      ...(routine.metadata ?? {}),
      legacy: true,
      legacyKind: "routine",
      legacyArtifactId: routine.routineId,
      legacyTaskIds: routine.taskIds
    }
  };
}

function findTaskFlow(task: AutomationStudioTaskArtifact, flows: AutomationStudioFlowDocument[]): AutomationStudioFlowDocument | undefined {
  return task.graph
    ?? flows.find((flow) => flow.flowId === task.graphId || flow.flowId === task.policyFlowId)
    ?? flows.find((flow) => flow.ownerKind === "task" && flow.ownerId === task.taskId);
}

function findRoutineFlow(routine: AutomationStudioRoutineArtifact, flows: AutomationStudioFlowDocument[]): AutomationStudioFlowDocument | undefined {
  return flows.find((flow) => flow.flowId === routine.flowId)
    ?? flows.find((flow) => flow.ownerKind === "routine" && flow.ownerId === routine.routineId);
}

function legacyFlowId(kind: "task" | "routine", artifactId: string): string {
  return `legacy.${kind}.${artifactId.replace(/[^A-Za-z0-9._-]+/g, "-") || "unnamed"}`;
}

function uniqueLegacyFlowId(seed: string, existingIds: Set<string>): string {
  const base = seed.replace(/[^A-Za-z0-9._-]+/g, "-") || "legacy.flow";
  let candidate = base;
  let suffix = 2;
  while (existingIds.has(candidate)) candidate = `${base}.${suffix++}`;
  return candidate;
}

function cloneNodes(nodes: AutomationStudioFlowDocument["nodes"]): AutomationStudioFlowDocument["nodes"] {
  return nodes.map((node) => ({
    ...node,
    ...(node.position ? { position: { ...node.position } } : {}),
    ...(node.parameterValues ? { parameterValues: { ...node.parameterValues } } : {}),
    ...(node.metadata ? { metadata: { ...node.metadata } } : {})
  }));
}

function cloneEdges(edges: AutomationStudioFlowDocument["edges"]): AutomationStudioFlowDocument["edges"] {
  return edges.map((edge) => ({ ...edge, ...(edge.metadata ? { metadata: { ...edge.metadata } } : {}) }));
}
