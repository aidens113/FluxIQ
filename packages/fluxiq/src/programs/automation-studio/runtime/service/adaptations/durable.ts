import type { JsonObject } from "../../../../../core/index.ts";
import {
  type AutomationStudioFlowAdaptation,
  type AutomationStudioFlowArtifact,
  type AutomationStudioFlowRouter,
  type AutomationStudioFlowSubflow,
  validateAutomationStudioFlow
} from "../../../model/index.ts";
import type { AutomationStudioFlowMutations, AutomationStudioFlowStore, AutomationStudioFlowWriter } from "../flows/index.ts";
import { assertFlowValidationOk, durableAdaptationMutationRecord, type AutomationStudioAdaptationPatches } from "./patches.ts";
import { isJsonRecord, jsonObjectFromUnknown, stringOrNull } from "../json-values.ts";
import { mapWithConcurrency, uniqueStrings, upsertBy } from "../collections.ts";
import { compactJsonObject } from "../compact-json.ts";
import type { AutomationStudioFacadePorts } from "../facade-ports.ts";

// Applying and reverting an adaptation durably: dispatching each patch to its
// applier, recording what was mutated so a failure can be rolled back, and
// stamping the applied adaptation onto the Flow.
export class AutomationStudioDurableAdaptations {
  constructor(
    private readonly flows: AutomationStudioFlowStore,
    private readonly flowWriter: AutomationStudioFlowWriter,
    private readonly flowMutations: AutomationStudioFlowMutations,
    private readonly patches: AutomationStudioAdaptationPatches,
    // Calls into the service's public surface go through this port, never
    // through the collaborator that owns the method, so an override or a stub
    // on the public method is still honoured. See service/facade-ports.ts.
    private readonly facade: AutomationStudioFacadePorts
  ) {}

  async applyFlowAdaptationDurably(
    adaptation: AutomationStudioFlowAdaptation,
    now: number,
    appliedBy: string
  ): Promise<{ appliedTo: NonNullable<AutomationStudioFlowAdaptation["appliedTo"]>; record: JsonObject }> {
    const mutations: JsonObject[] = [];
    try {
      for (const patch of adaptation.patch) {
        mutations.push(await this.applyFlowAdaptationPatchDurably(adaptation, patch, now));
      }
      mutations.push(await this.recordAppliedAdaptationOnFlow(adaptation, now, mutations));
    } catch (error) {
      await this.rollbackDurableAdaptationMutations(adaptation.projectId, mutations.slice().reverse());
      throw error;
    }
    const appliedTo = mutations.flatMap((mutation) => {
      const kind = typeof mutation.targetKind === "string" ? mutation.targetKind : undefined;
      const id = typeof mutation.targetId === "string" ? mutation.targetId : undefined;
      if (!kind || !id || kind === "flow") return [];
      return [{ kind: kind as NonNullable<AutomationStudioFlowAdaptation["appliedTo"]>[number]["kind"], id }];
    });
    return {
      appliedTo,
      record: compactJsonObject({
        appliedAt: now,
        appliedBy,
        reversible: true,
        durable: true,
        patches: structuredClone(adaptation.patch),
        mutations
      })
    };
  }

  async revertFlowAdaptationDurably(
    adaptation: AutomationStudioFlowAdaptation,
    reviewMetadata: JsonObject,
    now: number,
    revertedBy: string
  ): Promise<AutomationStudioFlowAdaptation> {
    const record = isJsonRecord(adaptation.metadata?.applicationRecord) ? adaptation.metadata.applicationRecord : undefined;
    const mutations = Array.isArray(record?.mutations) ? record.mutations.filter(isJsonRecord) : [];
    if (adaptation.status === "applied" && !mutations.length) throw new Error("Applied adaptation is missing durable rollback metadata.");
    await this.rollbackDurableAdaptationMutations(adaptation.projectId, mutations.slice().reverse());
    return {
      ...adaptation,
      status: "reverted",
      updatedAt: now,
      metadata: compactJsonObject({
        ...reviewMetadata,
        applicationRecord: record,
        revertRecord: compactJsonObject({
          revertedAt: now,
          revertedBy,
          durable: mutations.length > 0,
          mutationCount: mutations.length
        })
      })
    };
  }

  async applyFlowAdaptationPatchDurably(
    adaptation: AutomationStudioFlowAdaptation,
    patch: AutomationStudioFlowAdaptation["patch"][number],
    now: number
  ): Promise<JsonObject> {
    if (patch.kind === "edit_expectation" || patch.kind === "edit_action_target" || patch.kind === "edit_recovery") {
      return await this.patches.applyFlowNodeAdaptationPatch(adaptation, patch, now);
    }
    if (patch.kind === "edit_router") return await this.patches.applyRouterAdaptationPatch(adaptation, patch, now);
    if (patch.kind === "edit_subflow") return await this.patches.applySubflowAdaptationPatch(adaptation, patch, now);
    if (patch.kind === "create_subflow") return await this.patches.applyCreateSubflowAdaptationPatch(adaptation, patch, now);
    if (patch.kind === "edit_instruction") throw new Error("Instruction adaptation application is handled by the instruction review surface.");
    throw new Error(`Unsupported adaptation patch kind: ${patch.kind}`);
  }

  async recordAppliedAdaptationOnFlow(adaptation: AutomationStudioFlowAdaptation, now: number, mutations: JsonObject[]): Promise<JsonObject> {
    const before = await this.facade.getFlow(adaptation.projectId, adaptation.flowId);
    const metadata = before.metadata ?? {};
    const appliedAdaptationIds = uniqueStrings([
      ...(Array.isArray(metadata.appliedAdaptationIds) ? metadata.appliedAdaptationIds.filter((id): id is string => typeof id === "string") : []),
      adaptation.adaptationId
    ]);
    const structural = adaptation.patch.some((patch) => adaptationRequiresChangeProposal({ ...adaptation, patch: [patch] }));
    const scopeKind = mutations.find((mutation) => typeof mutation.targetKind === "string")?.targetKind;
    const targetId = mutations.find((mutation) => typeof mutation.targetId === "string")?.targetId;
    const after = {
      ...before,
      metadata: compactJsonObject({
        ...metadata,
        appliedAdaptationIds,
        ...(structural ? { lastStructuralChangeAt: now } : {}),
        stabilityReset: compactJsonObject({
          at: now,
          adaptationId: adaptation.adaptationId,
          ...(typeof scopeKind === "string" ? { scopeKind } : {}),
          ...(typeof targetId === "string" ? { targetId } : {})
        })
      }),
      updatedAt: now
    };
    assertFlowValidationOk(after, "Flow adaptation metadata update");
    const saved = await this.flowWriter.saveFlowInternal({ projectId: adaptation.projectId, flow: after }, false);
    return durableAdaptationMutationRecord({
      patchKind: "promote_adaptation",
      artifactKind: "flow",
      artifactId: saved.flowId,
      targetKind: "flow",
      targetId: saved.flowId,
      before,
      after: saved,
      validation: validateAutomationStudioFlow(saved)
    });
  }

  async rollbackDurableAdaptationMutations(projectId: string, mutations: JsonObject[]): Promise<void> {
    for (const mutation of mutations) {
      const artifactKind = mutation.artifactKind;
      const artifactId = typeof mutation.artifactId === "string" ? mutation.artifactId : "";
      const before = mutation.before;
      if (artifactKind === "flow") {
        if (!isJsonRecord(before)) {
          await this.flowWriter.deleteFlowArtifact({ projectId, flowId: artifactId }, false);
        } else {
          const rollback = isJsonRecord(mutation.rollback) ? mutation.rollback : undefined;
          if (rollback?.kind === "restore_owned_subflow_graph") {
            const parentFlowId = typeof rollback.parentFlowId === "string" ? rollback.parentFlowId.trim() : "";
            const subflowId = typeof rollback.subflowId === "string" ? rollback.subflowId.trim() : "";
            const graphFlowId = typeof rollback.graphFlowId === "string" ? rollback.graphFlowId.trim() : "";
            if (!parentFlowId || !subflowId || !graphFlowId || graphFlowId !== artifactId || before.flowId !== graphFlowId) {
              throw new Error(`Owned Subflow graph rollback metadata for ${artifactId} is invalid; rollback refused.`);
            }
            const subflow = await this.facade.getFlowSubflow(projectId, parentFlowId, subflowId);
            if (!subflow || subflow.graphFlowId !== graphFlowId) throw new Error(`Subflow graph ownership changed for ${graphFlowId}; rollback refused.`);
            const current = await this.facade.getFlow(projectId, graphFlowId);
            await this.flowWriter.assertOwnedSubflowGraph(projectId, current);
          }
          await this.flowWriter.saveFlowInternal({ projectId, flow: before as unknown as AutomationStudioFlowArtifact }, false);
        }
      } else if (artifactKind === "router") {
        if (!isJsonRecord(before)) throw new Error(`Router rollback for ${artifactId} is missing a before snapshot.`);
        await this.facade.saveFlowRouter(before as unknown as AutomationStudioFlowRouter);
      } else if (artifactKind === "subflow") {
        if (!isJsonRecord(before)) {
          const flowId = typeof mutation.flowId === "string" ? mutation.flowId : "";
          const after = isJsonRecord(mutation.after) ? mutation.after : undefined;
          const graphFlowId = typeof after?.graphFlowId === "string" ? after.graphFlowId : undefined;
          await this.flowMutations.deleteCreatedFlowSubflow(projectId, flowId, artifactId, graphFlowId, isJsonRecord(mutation.rollback) && mutation.rollback.createdGraphFlow === true);
        } else {
          await this.facade.saveFlowSubflow(before as unknown as AutomationStudioFlowSubflow);
        }
      }
    }
  }
}

export function adaptationRequiresChangeProposal(adaptation: AutomationStudioFlowAdaptation): boolean {
  return adaptation.patch.some((patch) => patch.kind === "create_subflow" || patch.kind === "edit_subflow" || patch.kind === "edit_router" || patch.kind === "edit_recovery");
}


