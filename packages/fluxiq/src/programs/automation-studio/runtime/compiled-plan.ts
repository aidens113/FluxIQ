import { createHash } from "node:crypto";
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../model/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace } from "./executor.ts";

export const AUTOMATION_STUDIO_COMPILED_PLAN_SCHEMA_VERSION = "automation-studio.compiled-plan.v1" as const;
export const AUTOMATION_STUDIO_COMPILED_PLAN_COMPILER_VERSION = "compiled-plan.v1" as const;

export type AutomationStudioCompiledPlanInstruction = {
  instructionId: string;
  title: string;
  body: string;
  scopeKind: string;
  requirement: string;
  priority: number;
  revision: number;
  contentDigest: string;
};

export type AutomationStudioCompiledPlanNode = {
  id: string;
  definitionId: string;
  definitionVersion: string;
  label: string;
  parameterValues: JsonObject;
  metadata: JsonObject;
};

export type AutomationStudioCompiledPlanEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePortId: string | null;
  targetPortId: string | null;
  label: string;
  metadata: JsonObject;
};

export type AutomationStudioCompiledPlan = {
  schemaVersion: typeof AUTOMATION_STUDIO_COMPILED_PLAN_SCHEMA_VERSION;
  compilerVersion: string;
  projectId: string;
  flowId: string;
  flowRevision: number;
  graphRevision: number;
  settingsRevision: number;
  instructionRevision: number;
  compiledAt: number;
  planDigest: string;
  startNodeId: string | null;
  nodes: AutomationStudioCompiledPlanNode[];
  edges: AutomationStudioCompiledPlanEdge[];
  edgesBySource: Record<string, string[]>;
  dependencies: Array<{ kind: string; id: string; revision?: number; digest?: string }>;
  resolvedSettings: JsonObject;
  resolvedInstructions: AutomationStudioCompiledPlanInstruction[];
  provenance: {
    graphRevisionId?: string;
    graphDigest?: string;
    settingsDigest: string;
    instructionDigest: string;
    nodeCount: number;
    edgeCount: number;
  };
};

export type CompileAutomationStudioPlanInput = {
  projectId: string;
  flowId: string;
  flowRevision: number;
  graphRevision: number;
  settingsRevision: number;
  instructionRevision?: number;
  compiledAt?: number;
  compilerVersion?: string;
  nodes: AutomationStudioCompiledPlanNode[];
  edges: AutomationStudioCompiledPlanEdge[];
  resolvedSettings?: JsonObject;
  resolvedInstructions?: AutomationStudioCompiledPlanInstruction[];
  dependencies?: Array<{ kind: string; id: string; revision?: number; digest?: string }>;
  graphRevisionId?: string;
  graphDigest?: string;
};

export function compileAutomationStudioPlan(input: CompileAutomationStudioPlanInput): AutomationStudioCompiledPlan {
  const nodes = [...input.nodes].sort((left, right) => left.id.localeCompare(right.id));
  const edges = [...input.edges].sort(compareCompiledEdges);
  const resolvedInstructions = [...(input.resolvedInstructions ?? [])].sort((left, right) => left.priority - right.priority || left.instructionId.localeCompare(right.instructionId));
  const dependencies = [...(input.dependencies ?? [])].sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`));
  const base = {
    schemaVersion: AUTOMATION_STUDIO_COMPILED_PLAN_SCHEMA_VERSION,
    compilerVersion: input.compilerVersion ?? AUTOMATION_STUDIO_COMPILED_PLAN_COMPILER_VERSION,
    projectId: input.projectId,
    flowId: input.flowId,
    flowRevision: positiveInteger(input.flowRevision, "flow revision"),
    graphRevision: positiveInteger(input.graphRevision, "graph revision"),
    settingsRevision: positiveInteger(input.settingsRevision, "settings revision"),
    instructionRevision: positiveInteger(input.instructionRevision ?? maxRevision(resolvedInstructions), "instruction revision"),
    compiledAt: Math.max(0, Math.trunc(input.compiledAt ?? Date.now())),
    startNodeId: nodes.find((node) => node.definitionId === "builtin.control.start")?.id ?? nodes[0]?.id ?? null,
    nodes,
    edges,
    edgesBySource: buildEdgesBySource(edges),
    dependencies,
    resolvedSettings: sortJsonObject(input.resolvedSettings ?? {}),
    resolvedInstructions,
    provenance: {
      ...(input.graphRevisionId ? { graphRevisionId: input.graphRevisionId } : {}),
      ...(input.graphDigest ? { graphDigest: input.graphDigest } : {}),
      settingsDigest: sha256(stableStringify(input.resolvedSettings ?? {})),
      instructionDigest: sha256(stableStringify(resolvedInstructions)),
      nodeCount: nodes.length,
      edgeCount: edges.length
    }
  };
  return { ...base, planDigest: sha256(stableStringify(base)) };
}

export function assertAutomationStudioCompiledPlan(value: unknown): asserts value is AutomationStudioCompiledPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Compiled Automation Studio plan must be an object.");
  const plan = value as Partial<AutomationStudioCompiledPlan>;
  if (plan.schemaVersion !== AUTOMATION_STUDIO_COMPILED_PLAN_SCHEMA_VERSION) throw new Error("Compiled Automation Studio plan schema version is unsupported.");
  if (!plan.flowId || !plan.projectId || !plan.compilerVersion || !plan.planDigest) throw new Error("Compiled Automation Studio plan identity is incomplete.");
  if (!Array.isArray(plan.nodes) || !Array.isArray(plan.edges) || !plan.edgesBySource) throw new Error("Compiled Automation Studio plan graph is incomplete.");
  const expected = sha256(stableStringify({ ...plan, planDigest: undefined }));
  const legacyExpected = sha256(stableStringify(withoutPlanDigest(plan)));
  if (plan.planDigest !== expected && plan.planDigest !== legacyExpected) throw new Error("Compiled Automation Studio plan digest mismatch.");
}

export function compiledPlanToFlowDocument(plan: AutomationStudioCompiledPlan): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1",
    flowId: plan.flowId,
    ownerKind: "policy",
    ownerId: plan.projectId,
    name: plan.flowId,
    nodes: plan.nodes.map(compiledNodeToFlowNode),
    edges: plan.edges.map(compiledEdgeToFlowEdge),
    createdAt: plan.compiledAt,
    updatedAt: plan.compiledAt,
    metadata: {
      compiledArtifact: true,
      compilerVersion: plan.compilerVersion,
      flowRevision: plan.flowRevision,
      graphRevision: plan.graphRevision,
      settingsRevision: plan.settingsRevision,
      instructionRevision: plan.instructionRevision,
      planDigest: plan.planDigest,
      resolvedSettings: plan.resolvedSettings,
      resolvedInstructionIds: plan.resolvedInstructions.map((instruction) => instruction.instructionId)
    }
  };
}

export function runAutomationStudioCompiledPlan(plan: AutomationStudioCompiledPlan, options: AutomationStudioGraphExecutionOptions = {}): Promise<AutomationStudioGraphExecutionTrace> {
  assertAutomationStudioCompiledPlan(plan);
  const startNodeId = options.startNodeId ?? plan.startNodeId ?? undefined;
  return runAutomationStudioGraph(compiledPlanToFlowDocument(plan), startNodeId ? { ...options, startNodeId } : options);
}

function compiledNodeToFlowNode(node: AutomationStudioCompiledPlanNode): AutomationStudioFlowNode {
  return {
    id: node.id,
    definitionId: node.definitionId,
    definitionVersion: node.definitionVersion,
    label: node.label,
    parameterValues: node.parameterValues,
    metadata: node.metadata
  };
}

function compiledEdgeToFlowEdge(edge: AutomationStudioCompiledPlanEdge): AutomationStudioFlowEdge {
  return {
    id: edge.id,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    ...(edge.sourcePortId !== null ? { sourcePortId: edge.sourcePortId } : {}),
    ...(edge.targetPortId !== null ? { targetPortId: edge.targetPortId } : {}),
    label: edge.label,
    metadata: edge.metadata
  };
}

function buildEdgesBySource(edges: AutomationStudioCompiledPlanEdge[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const edge of edges) (grouped[edge.sourceNodeId] ??= []).push(edge.id);
  for (const ids of Object.values(grouped)) ids.sort();
  return Object.fromEntries(Object.entries(grouped).sort(([left], [right]) => left.localeCompare(right)));
}

function compareCompiledEdges(left: AutomationStudioCompiledPlanEdge, right: AutomationStudioCompiledPlanEdge): number {
  return left.sourceNodeId.localeCompare(right.sourceNodeId) || (left.sourcePortId ?? "").localeCompare(right.sourcePortId ?? "") || left.targetNodeId.localeCompare(right.targetNodeId) || left.id.localeCompare(right.id);
}

function maxRevision(instructions: AutomationStudioCompiledPlanInstruction[]): number {
  return Math.max(1, ...instructions.map((instruction) => positiveInteger(instruction.revision, "instruction revision")));
}

function positiveInteger(value: number, label: string): number {
  const normalized = Math.trunc(value);
  if (!Number.isFinite(normalized) || normalized < 1) throw new Error(`Compiled Automation Studio ${label} must be positive.`);
  return normalized;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sortJsonObject(value: JsonObject): JsonObject {
  return JSON.parse(stableStringify(value)) as JsonObject;
}

function withoutPlanDigest(plan: Partial<AutomationStudioCompiledPlan>): Record<string, unknown> {
  const copy = { ...plan } as Record<string, unknown>;
  delete copy.planDigest;
  return copy;
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, JsonValue | unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}
