// The durable form of an in-run repair (state-aware recovery plan, C12): the
// `add_handler` and `replace_unit` a run overlaid at its failing step, written
// to the saved graph once the judged-promotion gate applies them, through the
// same overlay, held to one unit and to the digest the unit had.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioFlowAdaptation, type AutomationStudioFlowArtifact, type AutomationStudioFlowDocument, type AutomationStudioFlowRunDetail, type AutomationStudioFlowSubflow } from "../../../../model/index.ts";
import type { AutomationStudioAdaptationPolicy } from "../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import { prepareAutomationStudioInRunRepair } from "../../../live-patch.ts";
import type { AutomationStudioRuntimePatch } from "../../../llm/index.ts";
import { automationStudioJudgedPromotionCandidate, settleAutomationStudioJudgedPromotions } from "../../runtime-adaptation/index.ts";
import type { AutomationStudioSubflowSummaryPage } from "../../summaries/index.ts";
import { applyAutomationStudioUnitRepairPatch } from "../unit-repair-apply.ts";

const RUN_ID = "run.unit-repair";
const SUBFLOW_ID = "subflow.main";

const handler: AutomationStudioRuntimePatch = {
  kind: "add_handler",
  reason: "A notice covers the list; dismiss it and take the step again.",
  event: "retry",
  scope: { kind: "nodes", nodeIds: ["read"] },
  when: [{ fact: "dialog.visible", op: "visible" }],
  completionCheck: [{ fact: "dialog.visible", op: "absent" }],
  steps: [{ definitionId: "builtin.data.constant", parameters: { value: "dismiss" } }],
  then: { kind: "resume" },
  consequences: []
};

const replacement: AutomationStudioRuntimePatch = {
  kind: "replace_unit",
  reason: "The list is read in two steps now.",
  unit: { kind: "node", nodeId: "read" },
  steps: [{ definitionId: "builtin.data.constant", parameters: { value: "scroll" } }, { definitionId: "builtin.data.constant", parameters: { value: "read" } }],
  consequences: []
};

describe("applying a unit repair durably", () => {
  it("writes a new handler into the saved graph exactly as the run overlaid it", async () => {
    const store = savedGraphs();
    const prepared = prepare(handler);
    const mutations = await apply(store, prepared.adaptation);

    const saved = store.graphs.get("flow.graph")!;
    expect(saved.nodes).toEqual(prepared.overlay.flow.nodes);
    expect(saved.edges).toEqual(prepared.overlay.flow.edges);
    expect(mutations).toEqual([expect.objectContaining({ patchKind: "add_handler", targetKind: "subflow", targetId: SUBFLOW_ID, rollback: { kind: "restore_owned_subflow_graph", parentFlowId: "flow.parent", subflowId: SUBFLOW_ID, graphFlowId: "flow.graph" } })]);
  });

  it("writes a replaced unit, and refuses one whose saved unit changed since the repair was made", async () => {
    const store = savedGraphs();
    const prepared = prepare(replacement);
    await apply(store, prepared.adaptation);

    expect(store.graphs.get("flow.graph")!.nodes).toEqual(prepared.overlay.flow.nodes);

    const edited = savedGraphs();
    edited.graphs.get("flow.graph")!.nodes.find((node) => node.id === "read")!.parameterValues = { value: "edited by a person" };
    await expect(apply(edited, prepare(replacement).adaptation)).rejects.toThrow(/changed since the repair was made/u);
  });

  it("refuses a repair that would touch a second unit", async () => {
    const store = savedGraphs();
    const first = prepare(handler).adaptation;
    const second = prepare(replacement).adaptation;
    const twoUnits: AutomationStudioFlowAdaptation = { ...first, patch: [...first.patch, ...second.patch] };
    const misnamed: AutomationStudioFlowAdaptation = { ...second, patch: [{ ...second.patch[0]!, targetId: "open" }] };

    await expect(apply(store, twoUnits)).rejects.toThrow(/names one unit and changes nothing else/u);
    await expect(apply(store, misnamed)).rejects.toThrow(/names two units \(open and read\)/u);
    expect(store.saves).toBe(0);
  });

  it("writes an automation-scoped handler into the automation's recovery Subflow, created on demand", async () => {
    const store = savedGraphs();
    const adaptation = prepare(handler).adaptation;
    const automation: AutomationStudioFlowAdaptation = { ...adaptation, patch: [{ ...adaptation.patch[0]!, after: { ...(adaptation.patch[0]!.after as JsonObject), scope: { kind: "automation" } } }] };
    const mutations = await apply(store, automation);

    const recovery = store.graphs.get("flow.recovery")!;
    const written = recovery.nodes.find((node) => node.definitionId === "builtin.control.handler");
    expect(written?.parameterValues?.scope).toEqual({ kind: "automation" });
    expect(store.graphs.get("flow.graph")!.nodes).toHaveLength(3);
    expect(mutations.map((mutation) => [mutation.artifactKind, mutation.targetId])).toEqual([["subflow", "subflow.recovery"], ["flow", "subflow.recovery"]]);
    expect(mutations[0]).toMatchObject({ before: null, rollback: { kind: "delete_created_subflow", artifactId: "subflow.recovery" } });
  });
});

describe("the judged end of a run that repaired itself in place", () => {
  it("applies the fix only when the run kept it and its result was judged to answer", async () => {
    const prepared = prepare(handler);
    const repairId = `repair.${RUN_ID}.incident.1`;
    const pending = { autoApply: true, applyAt: "judged_whole_run", applied: false, runId: RUN_ID };
    const adaptation: AutomationStudioFlowAdaptation = { ...prepared.adaptation, metadata: { ...(prepared.adaptation.metadata ?? {}), approvalDecision: pending } };
    const detail = {
      adaptationIds: [adaptation.adaptationId],
      metadata: { inRunRepairs: [{ repairId, incidentId: "incident.1", outcome: "overlaid", kind: "add_handler", adaptationId: adaptation.adaptationId, approvalDecision: pending }] }
    } as unknown as AutomationStudioFlowRunDetail;
    const judged = { performed: true, verdict: "answers" };

    const kept = await settle(adaptation, detail, [repairId], judged);
    const dropped = await settle(adaptation, detail, [], judged);

    expect(kept.store.graphs.get("flow.graph")!.nodes).toEqual(prepared.overlay.flow.nodes);
    expect(kept.settled.metadata?.inRunRepairs).toEqual([expect.objectContaining({ approvalDecision: expect.objectContaining({ applied: true, judgedRunId: RUN_ID }) })]);
    expect(dropped.store.saves).toBe(0);
    expect(dropped.settled.metadata?.inRunRepairs).toEqual([expect.objectContaining({ approvalDecision: expect.objectContaining({ applied: false, notAppliedReason: "not_rerun" }) })]);
  });

  it("runs a later pass on a candidate that already carries the fix, and leaves an automation-scoped handler to the recovery graph", () => {
    const prepared = prepare(handler);
    const candidate = automationStudioJudgedPromotionCandidate({ flow: savedGraphs().graphs.get("flow.graph")!, adaptations: [prepared.adaptation], subflowId: SUBFLOW_ID });
    const automation: AutomationStudioFlowAdaptation = { ...prepared.adaptation, patch: [{ ...prepared.adaptation.patch[0]!, after: { ...(prepared.adaptation.patch[0]!.after as JsonObject), scope: { kind: "automation" } } }] };
    const elsewhere = automationStudioJudgedPromotionCandidate({ flow: savedGraphs().graphs.get("flow.graph")!, adaptations: [automation], subflowId: SUBFLOW_ID });

    expect(candidate.adaptationIds).toEqual([prepared.adaptation.adaptationId]);
    expect(candidate.flow.nodes).toEqual(prepared.overlay.flow.nodes);
    expect(elsewhere.flow.nodes).toEqual(graphContent().nodes);
  });
});

async function settle(adaptation: AutomationStudioFlowAdaptation, detail: AutomationStudioFlowRunDetail, keptRepairIds: string[], resultVerification: JsonObject) {
  const store = savedGraphs();
  const adaptations = new Map([[adaptation.adaptationId, structuredClone(adaptation)]]);
  const settled = await settleAutomationStudioJudgedPromotions({
    ports: {
      getFlowAdaptation: async (_projectId, _flowId, id) => adaptations.get(id) ?? null,
      saveFlowAdaptation: async (saved) => {
        adaptations.set(saved.adaptationId, saved);
        return saved;
      },
      applyFlowAdaptation: async (request) => {
        const stored = adaptations.get(request.adaptationId)!;
        await apply(store, stored);
        return { ...stored, status: "applied" };
      }
    },
    projectId: "project.unit-repair",
    flowId: "flow.parent",
    session: { runId: RUN_ID, status: "succeeded", metadata: { resultVerification }, trace: { repairs: keptRepairIds } },
    detail
  });
  return { store, settled };
}

type SavedGraphs = { graphs: Map<string, AutomationStudioFlowArtifact>; subflows: Map<string, AutomationStudioFlowSubflow>; saves: number };

async function apply(store: SavedGraphs, adaptation: AutomationStudioFlowAdaptation): Promise<JsonObject[]> {
  return await applyAutomationStudioUnitRepairPatch({
    adaptation,
    patch: adaptation.patch[0]!,
    now: 100,
    patches: {
      resolveFlowNodeAdaptationTarget: async (target) => ({ graphFlow: structuredClone(store.graphs.get(store.subflows.get(target.subflowId!)!.graphFlowId!)!), subflowId: target.subflowId!, validation: {} })
    },
    flowWriter: {
      saveFlowInternal: async (input) => {
        store.saves += 1;
        store.graphs.set(input.flow.flowId, structuredClone(input.flow));
        return input.flow;
      }
    },
    facade: {
      getFlow: async (_projectId, flowId) => structuredClone(store.graphs.get(flowId)!),
      getFlowSubflow: async (_projectId, _flowId, subflowId) => store.subflows.get(subflowId) ?? null,
      listFlowSubflowSummaries: async () => ({ subflows: [...store.subflows.values()].filter((subflow) => subflow.role === "recovery").map((subflow) => ({ subflowId: subflow.subflowId })), total: 0, limit: 1, offset: 0 }) as unknown as AutomationStudioSubflowSummaryPage,
      createFlowSubflow: async (input) => {
        const subflow = { ...store.subflows.get(SUBFLOW_ID)!, subflowId: "subflow.recovery", name: input.name, role: "recovery" as const, graphFlowId: "flow.recovery" };
        store.subflows.set(subflow.subflowId, subflow);
        store.graphs.set("flow.recovery", { ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.recovery", projectId: "project.unit-repair", name: "Recovery", now: 5 }), nodes: [], edges: [] });
        return subflow;
      }
    }
  });
}

/** The saved Subflow graph the run ran, and its Subflow record. */
function savedGraphs(): SavedGraphs {
  const graph: AutomationStudioFlowArtifact = { ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.graph", projectId: "project.unit-repair", name: "Read the list", now: 1 }), ...graphContent() };
  const subflow = { schemaVersion: "0.1", subflowId: SUBFLOW_ID, flowId: "flow.parent", projectId: "project.unit-repair", name: "Main", role: "main", status: "active", graphFlowId: "flow.graph", createdAt: 1, updatedAt: 1 } as unknown as AutomationStudioFlowSubflow;
  return { graphs: new Map([["flow.graph", graph]]), subflows: new Map([[SUBFLOW_ID, subflow]]), saves: 0 };
}

function graphContent(): Pick<AutomationStudioFlowDocument, "nodes" | "edges"> {
  return {
    nodes: [
      { id: "open", definitionId: "builtin.data.constant", parameterValues: { value: "open" }, position: { x: 0, y: 0 } },
      { id: "read", definitionId: "builtin.data.constant", parameterValues: { value: "read" }, position: { x: 320, y: 0 } },
      { id: "end", definitionId: "builtin.control.end", parameterValues: { resultStatus: "success" }, position: { x: 640, y: 0 } }
    ],
    edges: [
      { id: "open.read", sourceNodeId: "open", sourcePortId: "success", targetNodeId: "read", targetPortId: "in" },
      { id: "read.end", sourceNodeId: "read", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
    ]
  };
}

/** The fix as the run's in-run repair prepared it, on the graph the run was executing. */
function prepare(patch: AutomationStudioRuntimePatch) {
  const flow: AutomationStudioFlowDocument = { schemaVersion: "0.1", flowId: "flow.graph", ownerKind: "policy", ownerId: "flow.parent", name: "Read the list", createdAt: 1, updatedAt: 1, ...graphContent() };
  const prepared = prepareAutomationStudioInRunRepair({ projectId: "project.unit-repair", flowId: "flow.parent", subflowId: SUBFLOW_ID, runId: RUN_ID, flow, patch, failedAttempt: failedAttempt(), policy: policy(), sideEffectPermission: "permitted", now: () => 30 });
  if (!prepared.ok) throw new Error(`The fix was refused: ${prepared.reason}`);
  return prepared;
}

function failedAttempt(): AutomationStudioNodeAttemptTrace {
  return { attemptId: "read.attempt.4", nodeId: "read", definitionId: "builtin.data.constant", startedAt: 1, finishedAt: 2, status: "failed", route: "failed", inputs: {}, outputs: {}, effects: [], failure: { category: "target_not_found", code: "test.target.not_found", retryable: false } };
}

function policy(): AutomationStudioAdaptationPolicy {
  return {
    schemaVersion: "0.1", policyId: "policy.unit-repair", scope: { kind: "flow", flowId: "flow.parent" }, preset: "adaptive", proposalMode: "auto",
    allowRuntimeRecovery: true, allowCreateRecoveryPaths: true, allowModifySubflows: true, allowCreateSubflows: true, allowModifyRouter: true, allowModifyExpectations: true, allowModifyActionTargets: true,
    allowDeleteOrDisableBehavior: false, allowExternalSideEffects: false, requireApprovalForDestructiveChanges: true, requireApprovalForExternalSideEffects: false, createdAt: 1, updatedAt: 1
  };
}
