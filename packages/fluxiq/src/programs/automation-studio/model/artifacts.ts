import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioSchemaVersion } from "./evidence.ts";

/** `task`, `routine`, and owner-bound `flow` are legacy compatibility kinds. New executable work uses canonical Flow APIs. */
export type AutomationStudioProjectArtifactKind = "task" | "routine" | "config" | "flow";

/** @deprecated Ownership is retained only for legacy Flow-document compatibility. */
export type AutomationStudioFlowOwnerKind = "task" | "routine" | "policy";

export type AutomationStudioFlowNode = {
  id: string;
  definitionId: string;
  /** Exact node-definition version used to author this instance. Optional only for legacy documents. */
  definitionVersion?: string;
  label?: string;
  description?: string;
  parameterValues?: JsonObject;
  position?: { x: number; y: number };
  metadata?: JsonObject;
};

export type AutomationStudioFlowEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePortId?: string;
  targetPortId?: string;
  label?: string;
  metadata?: JsonObject;
};

/** @deprecated Use owner-independent AutomationStudioFlowArtifact for new writes. */
export type AutomationStudioFlowDocument = {
  schemaVersion: AutomationStudioSchemaVersion;
  flowId: string;
  ownerKind: AutomationStudioFlowOwnerKind;
  ownerId: string;
  name: string;
  description?: string;
  nodes: AutomationStudioFlowNode[];
  edges: AutomationStudioFlowEdge[];
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};

/** @deprecated New authoring must use AutomationStudioFlowArtifact. Read compatibility remains supported. */
export type AutomationStudioTaskArtifact = {
  schemaVersion: AutomationStudioSchemaVersion;
  taskId: string;
  name: string;
  description?: string;
  graphId?: string;
  policyFlowId?: string;
  graph?: AutomationStudioFlowDocument;
  signalRegistryId?: string;
  recordingIds: string[];
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};

/** @deprecated New authoring must use AutomationStudioFlowArtifact and published composites. */
export type AutomationStudioRoutineArtifact = {
  schemaVersion: AutomationStudioSchemaVersion;
  routineId: string;
  name: string;
  description?: string;
  flowId?: string;
  taskIds: string[];
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};

export type AutomationStudioConfigArtifact = {
  schemaVersion: AutomationStudioSchemaVersion;
  configId: string;
  name: string;
  description?: string;
  values: JsonObject;
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};

export type AutomationStudioProjectArtifacts = {
  tasks: AutomationStudioTaskArtifact[];
  routines: AutomationStudioRoutineArtifact[];
  configs: AutomationStudioConfigArtifact[];
  flows: AutomationStudioFlowDocument[];
};

export function createBlankAutomationStudioFlow(input: {
  flowId: string;
  ownerKind: AutomationStudioFlowOwnerKind;
  ownerId: string;
  name: string;
  description?: string;
  now?: number;
  metadata?: JsonObject;
}): AutomationStudioFlowDocument {
  const now = input.now ?? Date.now();
  return {
    schemaVersion: "0.1",
    flowId: input.flowId,
    ownerKind: input.ownerKind,
    ownerId: input.ownerId,
    name: input.name,
    ...(input.description !== undefined ? { description: input.description } : {}),
    nodes: [],
    edges: [],
    createdAt: now,
    updatedAt: now,
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {})
  };
}
