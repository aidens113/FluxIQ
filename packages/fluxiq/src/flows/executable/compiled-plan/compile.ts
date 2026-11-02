import type { JsonObject } from "../../../core/index.ts";
import { chooseAutomationStudioStartNode } from "../graph/index.ts";
import { AUTOMATION_STUDIO_COMPILED_PLAN_SCHEMA_VERSION } from "./schema-version.ts";
import { AUTOMATION_STUDIO_COMPILED_PLAN_COMPILER_VERSION } from "./compiler-version.ts";
import type { AutomationStudioCompiledPlan } from "./plan.ts";
import type { CompileAutomationStudioPlanInput } from "./input.ts";
import type { AutomationStudioCompiledPlanEdge } from "./edge.ts";
import type { AutomationStudioCompiledPlanInstruction } from "./instruction.ts";
import { digestAutomationStudioCompiledPlanValue as sha256 } from "./digest.ts";
import { serializeAutomationStudioCompiledPlanValue as stableStringify } from "./serialization.ts";

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
    startNodeId: chooseAutomationStudioStartNode({ nodes, edges }).node?.id ?? null,
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

function sortJsonObject(value: JsonObject): JsonObject {
  return JSON.parse(stableStringify(value)) as JsonObject;
}
