import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { safeSegment } from "../../../../_shared/storage.ts";
import {
  type AutomationStudioFlowAdaptation,
  type AutomationStudioFlowArtifact,
  type AutomationStudioFlowRouter,
  type AutomationStudioFlowSubflow,
  validateAutomationStudioFlow,
  validateAutomationStudioFlowRouter,
  validateAutomationStudioFlowSubflow
} from "../../../model/index.ts";
import path from "node:path";
import type { AutomationStudioFlowMutations, AutomationStudioFlowStore, AutomationStudioFlowWriter } from "../flows/index.ts";
import { isJsonRecord, jsonObjectFromUnknown, stringOrNull } from "../json-values.ts";
import { compactJsonObject } from "../compact-json.ts";
import { flowSummaryFromFlow, removeUndefinedSubflowFields, subflowParentCategoryId } from "../flows/index.ts";

// Applying one adaptation patch to its target: a Flow node, a Router, an
// existing Subflow, or a Subflow the patch creates. Each applier validates the
// document it produced before the write is allowed to stand.
export class AutomationStudioAdaptationPatches {
  constructor(
    private readonly flows: AutomationStudioFlowStore,
    private readonly flowWriter: AutomationStudioFlowWriter,
    private readonly flowMutations: AutomationStudioFlowMutations
  ) {}

  async applyFlowNodeAdaptationPatch(
    adaptation: AutomationStudioFlowAdaptation,
    patch: AutomationStudioFlowAdaptation["patch"][number],
    now: number
  ): Promise<JsonObject> {
    if (!patch.targetId) throw new Error(`Patch ${patch.kind} is missing a target node.`);
    const target = await this.resolveFlowNodeAdaptationTarget(adaptation);
    const before = target.graphFlow;
    const nodeIndex = before.nodes.findIndex((node) => node.id === patch.targetId);
    if (nodeIndex < 0) throw new Error(`Unknown Flow node for adaptation patch: ${patch.targetId}`);
    const nodes = structuredClone(before.nodes);
    const node = nodes[nodeIndex]!;
    const parameterValues = { ...(node.parameterValues ?? {}) };
    if (patch.kind === "edit_expectation") {
      if (!isJsonRecord(patch.after)) throw new Error("Expectation adaptation patches must provide an object after value.");
      node.parameterValues = compactJsonObject({ ...parameterValues, ...patch.after });
    } else if (patch.kind === "edit_action_target") {
      if (patch.after === undefined) throw new Error("Action target adaptation patches must provide an after value.");
      node.parameterValues = compactJsonObject({ ...parameterValues, target: structuredClone(patch.after) });
    } else {
      if (!isJsonRecord(patch.after)) throw new Error("Recovery adaptation patches must provide an object after value.");
      node.parameterValues = compactJsonObject({ ...parameterValues, recovery: { ...(isJsonRecord(parameterValues.recovery) ? parameterValues.recovery : {}), ...patch.after } });
    }
    const after = {
      ...before,
      nodes,
      updatedAt: now
    };
    assertFlowValidationOk(after, "Flow node adaptation patch");
    const saved = await this.flowWriter.saveFlowInternal({ projectId: adaptation.projectId, flow: after }, false);
    return durableAdaptationMutationRecord({
      patchKind: patch.kind,
      artifactKind: "flow",
      artifactId: saved.flowId,
      targetKind: appliedTargetKindForPatch(patch.kind),
      targetId: patch.targetId,
      before,
      after: saved,
      validation: validateAutomationStudioFlow(saved),
      ...(target.subflowId ? {
        rollback: compactJsonObject({
          kind: "restore_owned_subflow_graph",
          parentFlowId: adaptation.flowId,
          subflowId: target.subflowId,
          graphFlowId: saved.flowId
        })
      } : {})
    });
  }

  async resolveFlowNodeAdaptationTarget(
    adaptation: AutomationStudioFlowAdaptation
  ): Promise<{ graphFlow: AutomationStudioFlowArtifact; subflowId?: string }> {
    const parent = await this.flows.getFlow(adaptation.projectId, adaptation.flowId);
    const representation = this.flowWriter.persistedFlowRepresentation(parent);
    if (representation === "legacy_single_graph") {
      if (adaptation.subflowId) throw new Error("Legacy single-graph adaptations cannot declare a Subflow target.");
      return { graphFlow: parent };
    }
    if (representation !== "orchestration") throw new Error("Flow adaptations must remain scoped to a top-level orchestration Flow.");
    const subflowId = adaptation.subflowId?.trim();
    if (!subflowId) throw new Error("Node adaptation on an orchestration Flow requires an explicit Subflow target.");
    const subflow = await this.flows.getFlowSubflow(adaptation.projectId, parent.flowId, subflowId);
    if (!subflow) throw new Error(`Subflow ${subflowId} is not owned by orchestration Flow ${parent.flowId}; node adaptation refused.`);
    const graphFlowId = subflow.graphFlowId?.trim();
    if (!graphFlowId) throw new Error(`Subflow ${subflowId} does not own a graph Flow; node adaptation refused.`);
    const graphFlow = await this.flows.getFlow(adaptation.projectId, graphFlowId).catch(() => null);
    if (!graphFlow) throw new Error(`Subflow ${subflowId} graph Flow ${graphFlowId} could not be loaded; node adaptation refused.`);
    await this.flowWriter.assertOwnedSubflowGraph(adaptation.projectId, graphFlow);
    if (graphFlow.metadata?.parentFlowId !== parent.flowId || graphFlow.metadata?.parentSubflowId !== subflowId) {
      throw new Error(`Subflow ${subflowId} graph ownership does not match orchestration Flow ${parent.flowId}; node adaptation refused.`);
    }
    return { graphFlow, subflowId };
  }

  async applyRouterAdaptationPatch(
    adaptation: AutomationStudioFlowAdaptation,
    patch: AutomationStudioFlowAdaptation["patch"][number],
    now: number
  ): Promise<JsonObject> {
    if (!isJsonRecord(patch.after)) throw new Error("Router adaptation patches must provide an object after value.");
    const toNodeId = typeof patch.after.toNodeId === "string" ? patch.after.toNodeId.trim() : "";
    if (toNodeId) {
      if (!patch.targetId) throw new Error("Router reroute patches must include the source node as targetId.");
      const target = await this.resolveFlowNodeAdaptationTarget(adaptation);
      const before = target.graphFlow;
      if (!before.nodes.some((node) => node.id === patch.targetId)) throw new Error(`Unknown source node for router reroute patch: ${patch.targetId}`);
      if (!before.nodes.some((node) => node.id === toNodeId)) throw new Error(`Unknown target node for router reroute patch: ${toNodeId}`);
      const edgeId = `adaptation.${safeSegment(adaptation.adaptationId)}.${safeSegment(patch.targetId)}.${safeSegment(toNodeId)}`;
      const edges = before.edges.some((edge) => edge.id === edgeId)
        ? structuredClone(before.edges)
        : [...structuredClone(before.edges), { id: edgeId, sourceNodeId: patch.targetId, sourcePortId: "failed", targetNodeId: toNodeId, targetPortId: "in", metadata: { adaptationId: adaptation.adaptationId } }];
      const after = { ...before, edges, updatedAt: now };
      assertFlowValidationOk(after, "Router reroute adaptation patch");
      const saved = await this.flowWriter.saveFlowInternal({ projectId: adaptation.projectId, flow: after }, false);
      return durableAdaptationMutationRecord({
        patchKind: patch.kind,
        artifactKind: "flow",
        artifactId: saved.flowId,
        targetKind: "router",
        targetId: patch.targetId,
        before,
        after: saved,
        validation: validateAutomationStudioFlow(saved),
        ...(target.subflowId ? {
          rollback: compactJsonObject({
            kind: "restore_owned_subflow_graph",
            parentFlowId: adaptation.flowId,
            subflowId: target.subflowId,
            graphFlowId: saved.flowId
          })
        } : {})
      });
    }
    const router = await this.flows.getFlowRouter(adaptation.projectId, adaptation.flowId);
    if (!router) throw new Error(`Unknown Flow router for adaptation: ${adaptation.flowId}`);
    const after = compactJsonObject({
      ...router,
      ...patch.after,
      schemaVersion: router.schemaVersion,
      routerId: router.routerId,
      flowId: router.flowId,
      projectId: router.projectId,
      createdAt: router.createdAt,
      updatedAt: now
    }) as unknown as AutomationStudioFlowRouter;
    const subflows = await this.flowMutations.getFlowSubflowsForValidation(adaptation.projectId, adaptation.flowId);
    assertRouterValidationOk(after, subflows, "Router adaptation patch");
    const saved = await this.flowMutations.saveFlowRouter(after);
    return durableAdaptationMutationRecord({
      patchKind: patch.kind,
      artifactKind: "router",
      artifactId: saved.routerId,
      targetKind: "router",
      targetId: saved.routerId,
      before: router,
      after: saved,
      validation: validateAutomationStudioFlowRouter(saved, subflows)
    });
  }

  async applySubflowAdaptationPatch(
    adaptation: AutomationStudioFlowAdaptation,
    patch: AutomationStudioFlowAdaptation["patch"][number],
    now: number
  ): Promise<JsonObject> {
    if (!patch.targetId) throw new Error("Subflow adaptation patches must include targetId.");
    if (!isJsonRecord(patch.after)) throw new Error("Subflow adaptation patches must provide an object after value.");
    const before = await this.flows.getFlowSubflow(adaptation.projectId, adaptation.flowId, patch.targetId);
    if (!before) throw new Error(`Unknown subflow for adaptation patch: ${patch.targetId}`);
    const after = removeUndefinedSubflowFields({
      ...before,
      ...patch.after,
      schemaVersion: before.schemaVersion,
      subflowId: before.subflowId,
      flowId: before.flowId,
      projectId: before.projectId,
      createdAt: before.createdAt,
      updatedAt: now
    } as AutomationStudioFlowSubflow);
    assertSubflowValidationOk(after, "Subflow adaptation patch");
    const saved = await this.flowMutations.saveFlowSubflow(after);
    return durableAdaptationMutationRecord({
      patchKind: patch.kind,
      artifactKind: "subflow",
      artifactId: saved.subflowId,
      targetKind: "subflow",
      targetId: saved.subflowId,
      before,
      after: saved,
      validation: validateAutomationStudioFlowSubflow(saved)
    });
  }

  async applyCreateSubflowAdaptationPatch(
    adaptation: AutomationStudioFlowAdaptation,
    patch: AutomationStudioFlowAdaptation["patch"][number],
    now: number
  ): Promise<JsonObject> {
    const after = isJsonRecord(patch.after) ? patch.after : {};
    const name = typeof after.name === "string" && after.name.trim() ? after.name.trim() : patch.summary.trim() || "Adapted subflow";
    const created = await this.flowMutations.createFlowSubflow({
      projectId: adaptation.projectId,
      flowId: adaptation.flowId,
      name,
      ...(typeof after.description === "string" ? { description: after.description } : {}),
      ...(typeof after.role === "string" ? { role: after.role as AutomationStudioFlowSubflow["role"] } : {}),
      ...(Array.isArray(after.routeTags) ? { routeTags: after.routeTags.filter((tag): tag is string => typeof tag === "string") } : {})
    });
    const saved = await this.flowMutations.saveFlowSubflow({
      ...created,
      metadata: {
        ...(created.metadata ?? {}),
        createdByAdaptationId: adaptation.adaptationId,
        createdGraphFlow: true
      },
      updatedAt: Math.max(now, created.createdAt)
    });
    return durableAdaptationMutationRecord({
      patchKind: patch.kind,
      artifactKind: "subflow",
      artifactId: saved.subflowId,
      targetKind: "subflow",
      targetId: saved.subflowId,
      before: null,
      after: saved,
      validation: validateAutomationStudioFlowSubflow(saved),
      rollback: compactJsonObject({
        kind: "delete_created_subflow",
        artifactKind: "subflow",
        artifactId: saved.subflowId,
        graphFlowId: saved.graphFlowId,
        createdGraphFlow: saved.metadata?.createdGraphFlow === true
      })
    });
  }
}

export function assertFlowValidationOk(flow: AutomationStudioFlowArtifact, context: string): void {
  const validation = validateAutomationStudioFlow(flow);
  if (!validation.ok) throw new Error(`${context} failed validation: ${validation.issues.map((issue) => `${issue.path} (${issue.code})`).join(", ")}`);
}

export function durableAdaptationMutationRecord(input: {
  patchKind: AutomationStudioFlowAdaptation["patch"][number]["kind"] | "promote_adaptation";
  artifactKind: "flow" | "router" | "subflow";
  artifactId: string;
  targetKind: NonNullable<AutomationStudioFlowAdaptation["appliedTo"]>[number]["kind"] | "flow";
  targetId: string;
  before: unknown;
  after: unknown;
  validation: { ok: boolean; issues: unknown[] };
  rollback?: JsonObject;
}): JsonObject {
  return compactJsonObject({
    patchKind: input.patchKind,
    artifactKind: input.artifactKind,
    artifactId: input.artifactId,
    flowId: isJsonRecord(input.after) && typeof input.after.flowId === "string" ? input.after.flowId : undefined,
    targetKind: input.targetKind,
    targetId: input.targetId,
    before: structuredClone(input.before) as JsonValue,
    after: structuredClone(input.after) as JsonValue,
    validation: structuredClone(input.validation) as JsonValue,
    rollback: input.rollback ?? compactJsonObject({
      kind: "restore_artifact",
      artifactKind: input.artifactKind,
      artifactId: input.artifactId
    })
  });
}

function appliedTargetKindForPatch(kind: AutomationStudioFlowAdaptation["patch"][number]["kind"]): NonNullable<AutomationStudioFlowAdaptation["appliedTo"]>[number]["kind"] {
  if (kind === "edit_router") return "router";
  if (kind === "create_subflow" || kind === "edit_subflow") return "subflow";
  if (kind === "edit_expectation") return "expectation";
  if (kind === "edit_action_target") return "action_target";
  if (kind === "edit_instruction") return "instruction";
  return "instruction";
}

function assertRouterValidationOk(router: AutomationStudioFlowRouter, subflows: AutomationStudioFlowSubflow[], context: string): void {
  const validation = validateAutomationStudioFlowRouter(router, subflows);
  if (!validation.ok) throw new Error(`${context} failed validation: ${validation.issues.map((issue) => `${issue.path} (${issue.code})`).join(", ")}`);
}

function assertSubflowValidationOk(subflow: AutomationStudioFlowSubflow, context: string): void {
  const validation = validateAutomationStudioFlowSubflow(subflow);
  if (!validation.ok) throw new Error(`${context} failed validation: ${validation.issues.map((issue) => `${issue.path} (${issue.code})`).join(", ")}`);
}
