import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import {
  type AutomationStudioFlowAdaptation,
  type AutomationStudioFlowArtifact,
  type AutomationStudioFlowRouter,
  type AutomationStudioFlowSubflow,
  type AutomationStudioFlowValidationContext,
  validateAutomationStudioFlow,
  validateAutomationStudioFlowRouter,
  validateAutomationStudioFlowSubflow
} from "../../../model/index.ts";
import path from "node:path";
import { automationStudioGraphFlowWithAdaptationPatch } from "./graph-flow-patch.ts";
import type { AutomationStudioFlowMutations, AutomationStudioFlowStore, AutomationStudioFlowWriter } from "../flows/index.ts";
import { isJsonRecord, jsonObjectFromUnknown, stringOrNull } from "../json-values.ts";
import { compactJsonObject } from "../compact-json.ts";
import { flowSummaryFromFlow, removeUndefinedSubflowFields, subflowParentCategoryId } from "../flows/index.ts";
import type { AutomationStudioFacadePorts } from "../facade-ports.ts";

// Applying one adaptation patch to its target: a Flow node, a Router, an
// existing Subflow, or a Subflow the patch creates. Each applier validates the
// document it produced before the write is allowed to stand.
export class AutomationStudioAdaptationPatches {
  constructor(
    private readonly flows: AutomationStudioFlowStore,
    private readonly flowWriter: AutomationStudioFlowWriter,
    private readonly flowMutations: AutomationStudioFlowMutations,
    // Calls into the service's public surface go through this port, never
    // through the collaborator that owns the method, so an override or a stub
    // on the public method is still honoured. See service/facade-ports.ts.
    private readonly facade: AutomationStudioFacadePorts
  ) {}

  async applyFlowNodeAdaptationPatch(
    adaptation: AutomationStudioFlowAdaptation,
    patch: AutomationStudioFlowAdaptation["patch"][number],
    now: number
  ): Promise<JsonObject> {
    // Only the two patch kinds that write a parameter the executor actually
    // reads may be applied to a node. Anything else is refused here rather than
    // written and reported as applied. See `durable.ts` for `edit_recovery`.
    //
    // `insert_deterministic_path` never reaches this applier: it inserts nodes
    // and edges, which only the transactional graph store can do as one
    // reversible unit, so `isGraphTransactionCompatibleAdaptation` claims it and
    // `graphPatchOperationsForAdaptation` builds it. Saving the whole Flow
    // document, which is all this file can do, has no inverse that restores the
    // edges a later delete would cascade.
    if (patch.kind !== "edit_expectation" && patch.kind !== "edit_action_target") {
      throw new Error(`Adaptation patch ${patch.kind} has no Flow node application; ${adaptation.adaptationId} refused.`);
    }
    if (!patch.targetId) throw new Error(`Patch ${patch.kind} is missing a target node.`);
    const target = await this.resolveFlowNodeAdaptationTarget(adaptation);
    const before = target.graphFlow;
    // Written by the same function a judged run's candidate is built with (`graph-flow-patch.ts`).
    const after = automationStudioGraphFlowWithAdaptationPatch(before, adaptation, patch, now);
    // The Subflow's role, which the graph does not carry (t398).
    const validationContext = target.validation;
    assertFlowValidationOk(after, "Flow node adaptation patch", validationContext);
    const saved = await this.flowWriter.saveFlowInternal({ projectId: adaptation.projectId, flow: after, validation: validationContext }, false);
    return durableAdaptationMutationRecord({
      patchKind: patch.kind,
      artifactKind: "flow",
      artifactId: saved.flowId,
      targetKind: patch.kind === "edit_expectation" ? "expectation" : "action_target",
      targetId: patch.targetId,
      before,
      after: saved,
      validation: validateAutomationStudioFlow(saved, validationContext),
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
  ): Promise<{ graphFlow: AutomationStudioFlowArtifact; subflowId?: string; validation: AutomationStudioFlowValidationContext }> {
    const parent = await this.facade.getFlow(adaptation.projectId, adaptation.flowId);
    const representation = this.flowWriter.persistedFlowRepresentation(parent);
    if (representation === "legacy_single_graph") {
      if (adaptation.subflowId) throw new Error("Legacy single-graph adaptations cannot declare a Subflow target.");
      return { graphFlow: parent, validation: {} };
    }
    if (representation !== "orchestration") throw new Error("Flow adaptations must remain scoped to a top-level orchestration Flow.");
    const subflowId = adaptation.subflowId?.trim();
    if (!subflowId) throw new Error("Node adaptation on an orchestration Flow requires an explicit Subflow target.");
    const subflow = await this.facade.getFlowSubflow(adaptation.projectId, parent.flowId, subflowId);
    if (!subflow) throw new Error(`Subflow ${subflowId} is not owned by orchestration Flow ${parent.flowId}; node adaptation refused.`);
    const graphFlowId = subflow.graphFlowId?.trim();
    if (!graphFlowId) throw new Error(`Subflow ${subflowId} does not own a graph Flow; node adaptation refused.`);
    const graphFlow = await this.facade.getFlow(adaptation.projectId, graphFlowId).catch(() => null);
    if (!graphFlow) throw new Error(`Subflow ${subflowId} graph Flow ${graphFlowId} could not be loaded; node adaptation refused.`);
    await this.flowWriter.assertOwnedSubflowGraph(adaptation.projectId, graphFlow);
    if (graphFlow.metadata?.parentFlowId !== parent.flowId || graphFlow.metadata?.parentSubflowId !== subflowId) {
      throw new Error(`Subflow ${subflowId} graph ownership does not match orchestration Flow ${parent.flowId}; node adaptation refused.`);
    }
    return { graphFlow, subflowId, validation: { subflowRole: subflow.role } };
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
      const after = automationStudioGraphFlowWithAdaptationPatch(before, adaptation, patch, now);
      const validationContext = target.validation;
      assertFlowValidationOk(after, "Router reroute adaptation patch", validationContext);
      const saved = await this.flowWriter.saveFlowInternal({ projectId: adaptation.projectId, flow: after, validation: validationContext }, false);
      return durableAdaptationMutationRecord({
        patchKind: patch.kind,
        artifactKind: "flow",
        artifactId: saved.flowId,
        targetKind: "router",
        targetId: patch.targetId,
        before,
        after: saved,
        validation: validateAutomationStudioFlow(saved, validationContext),
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
    const router = await this.facade.getFlowRouter(adaptation.projectId, adaptation.flowId);
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
    const saved = await this.facade.saveFlowRouter(after);
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
    const before = await this.facade.getFlowSubflow(adaptation.projectId, adaptation.flowId, patch.targetId);
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
    const saved = await this.facade.saveFlowSubflow(after);
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
    const created = await this.facade.createFlowSubflow({
      projectId: adaptation.projectId,
      flowId: adaptation.flowId,
      name,
      ...(typeof after.description === "string" ? { description: after.description } : {}),
      ...(typeof after.role === "string" ? { role: after.role as AutomationStudioFlowSubflow["role"] } : {}),
      ...(Array.isArray(after.routeTags) ? { routeTags: after.routeTags.filter((tag): tag is string => typeof tag === "string") } : {})
    });
    const saved = await this.facade.saveFlowSubflow({
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

export function assertFlowValidationOk(flow: AutomationStudioFlowArtifact, context: string, validationContext: AutomationStudioFlowValidationContext = {}): void {
  const validation = validateAutomationStudioFlow(flow, validationContext);
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

function assertRouterValidationOk(router: AutomationStudioFlowRouter, subflows: AutomationStudioFlowSubflow[], context: string): void {
  const validation = validateAutomationStudioFlowRouter(router, subflows);
  if (!validation.ok) throw new Error(`${context} failed validation: ${validation.issues.map((issue) => `${issue.path} (${issue.code})`).join(", ")}`);
}

function assertSubflowValidationOk(subflow: AutomationStudioFlowSubflow, context: string): void {
  const validation = validateAutomationStudioFlowSubflow(subflow);
  if (!validation.ok) throw new Error(`${context} failed validation: ${validation.issues.map((issue) => `${issue.path} (${issue.code})`).join(", ")}`);
}
