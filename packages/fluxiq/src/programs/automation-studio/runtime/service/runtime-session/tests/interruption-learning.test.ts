// The run session's side of learning a layer the client's defence closed
// (t516): no model is asked. The domain names the pressed way out by a handle
// and resolves the step that presses it; the handler goes through the in-run
// repair's preflight, overlay and records; and the run detail carries the
// diagnosis, the patch attempt and the adaptation a gate reads as detected,
// repaired and kept.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import type { AutomationStudioInterruptionLearningRequest } from "../../../executor/lifecycle-run/index.ts";
import type { AutomationStudioTrainingModeBehavior } from "../../../training-modes.ts";
import { runtimeRunDetailWithAdaptationContext, settleAutomationStudioJudgedPromotions } from "../../runtime-adaptation/index.ts";
import { bindAutomationStudioInRunRepair } from "../in-run-repair.ts";
import { IN_RUN_REPAIR_FLOW_ID, IN_RUN_REPAIR_PROJECT_ID, IN_RUN_REPAIR_RUN_ID, IN_RUN_REPAIR_SUBFLOW_ID, inRunRepairGraph, inRunRepairWorld, type InRunRepairWorld } from "./in-run-repair-fixture.ts";

const LAYER = { kind: "dialog" as const, control: "Maybe later", name: "Join the reading club", controlName: "Maybe later, thanks", wayOut: "way-out.0a1b", wayOutDefinitionId: "test.output.press" };
const RESOLVED_TARGET: JsonObject = { selector: "#club-later", element: { accessibleName: "Maybe later, thanks" } };

/** The world, with a domain that names the way out `t7` and resolves a step naming it to `RESOLVED_TARGET`. */
function world(options: { handles?: Record<string, string>; behavior?: Partial<AutomationStudioTrainingModeBehavior> } = {}): InRunRepairWorld & { resolved: JsonObject[] } {
  const made = inRunRepairWorld({ scripts: [], ...(options.behavior ? { behavior: options.behavior } : {}) });
  const resolved: JsonObject[] = [];
  const handles = options.handles ?? { [LAYER.wayOut]: "t7" };
  made.ports = {
    ...made.ports,
    llmEvidenceRuntime: {
      ...made.ports.llmEvidenceRuntime!,
      clearedControlHandles: async ({ wayOuts }) => Object.fromEntries(wayOuts.flatMap((reference) => (handles[reference] ? [[reference, handles[reference]]] : []))),
      resolvePlanNodeParameters: async (input) => {
        resolved.push({ definitionId: input.nodeDefinitionId, parameters: input.parameters, reach: input.handleReach ?? null });
        return { status: "resolved", parameters: { target: RESOLVED_TARGET } };
      }
    }
  };
  return { ...made, resolved };
}

function learningRequest(): AutomationStudioInterruptionLearningRequest {
  const attempt: AutomationStudioNodeAttemptTrace = { attemptId: "read.attempt.1", nodeId: "read", definitionId: "builtin.data.constant", startedAt: 10, finishedAt: 11, status: "succeeded", route: "success", inputs: {}, outputs: {}, effects: [], framePath: ["frame.root"], clearedLayers: [LAYER] };
  return { graph: inRunRepairGraph(), subflowId: IN_RUN_REPAIR_SUBFLOW_ID, framePath: ["frame.root"], attempt, layer: LAYER };
}

function emptyDetail(): AutomationStudioFlowRunDetail {
  return { runId: IN_RUN_REPAIR_RUN_ID, projectId: IN_RUN_REPAIR_PROJECT_ID, flowId: IN_RUN_REPAIR_FLOW_ID, interventions: [], adaptationIds: [], changeProposalIds: [], metadata: {} } as unknown as AutomationStudioFlowRunDetail;
}

describe("learning a closed layer in the run session", () => {
  it("proposes the handler with no model, resolves its press through the domain, overlays it, and records it for the judged end", async () => {
    const learning = world({ behavior: { invokeLlm: false } });
    const context = bindAutomationStudioInRunRepair({ context: learning.context, graphOptions: learning.graphOptions, ports: learning.ports, runId: IN_RUN_REPAIR_RUN_ID });
    // A run that asks no model still learns, and still repairs nothing at a failure.
    expect(learning.graphOptions.repairIncident).toBeUndefined();
    const learn = learning.graphOptions.learnInterruption;
    if (!learn) throw new Error("No learnInterruption was supplied.");
    const answer = await learn(learningRequest());

    expect(learning.requests).toHaveLength(0);
    expect(learning.resolved).toEqual([{ definitionId: "test.output.press", parameters: { target: { handle: "t7" } }, reach: "view_history" }]);
    expect(answer.kind).toBe("overlay");
    if (answer.kind !== "overlay") return;
    expect(answer.unit.kind).toBe("handler");
    const handler = answer.graph.nodes.find((node) => node.definitionId === "builtin.control.handler");
    expect(handler?.parameterValues).toMatchObject({ event: "before", scope: { kind: "subflow", inherit: false }, when: [{ fact: "dialog", op: "visible", value: "Join the reading club" }], completionCheck: [{ fact: "dialog", op: "absent", value: "Join the reading club" }] });
    const press = answer.graph.nodes.find((node) => node.definitionId === "test.output.press");
    expect(press?.parameterValues).toEqual({ target: RESOLVED_TARGET });

    const [adaptation] = [...learning.adaptations.values()];
    expect(adaptation).toMatchObject({ sourceRunId: IN_RUN_REPAIR_RUN_ID, status: "testing", patch: [{ kind: "add_handler", targetId: "read" }], metadata: { approvalDecision: { applyAt: "judged_whole_run", applied: false } } });
    expect(context.inRunRepairs?.receipts()).toEqual([expect.objectContaining({ repairId: answer.repairId, outcome: "overlaid", kind: "add_handler", adaptationId: adaptation?.adaptationId, learnedFrom: "defence_close" })]);
    expect(context.inRunRepairs?.overlays()).toEqual([expect.objectContaining({ repairId: answer.repairId, framePath: ["frame.root"] })]);

    // What the run detail carries: the deterministic diagnosis, the patch it validated, and the adaptation.
    const detail = runtimeRunDetailWithAdaptationContext(emptyDetail(), context);
    expect(detail.interventions.map((intervention) => [intervention.kind, intervention.validation?.ok, intervention.provider ?? null])).toEqual([["diagnosis", true, null], ["runtime_patch", true, null]]);
    expect(detail.adaptationIds).toEqual([adaptation?.adaptationId]);
    expect(detail.metadata?.runtimePatchAttempts).toEqual([expect.objectContaining({ kind: "add_handler", preflightOk: true, adaptationId: adaptation?.adaptationId, inRun: true })]);
  });

  it("learns nothing when the domain cannot name the way out, and nothing is saved", async () => {
    const learning = world({ handles: {} });
    const context = bindAutomationStudioInRunRepair({ context: learning.context, graphOptions: learning.graphOptions, ports: learning.ports, runId: IN_RUN_REPAIR_RUN_ID });
    const answer = await learning.graphOptions.learnInterruption!(learningRequest());

    expect(answer.kind).toBe("none");
    expect(learning.adaptations.size).toBe(0);
    expect(context.inRunRepairs?.receipts()).toEqual([expect.objectContaining({ outcome: "none", code: "way_out_unnamed", learnedFrom: "defence_close" })]);
  });

  it("keeps distinct repair receipts for two layers closed by the same attempt", async () => {
    const other = { ...LAYER, name: "Reading reminders", wayOut: "way-out.0a2b" };
    const learning = world({ handles: { [LAYER.wayOut]: "t7", [other.wayOut]: "t8" } });
    const context = bindAutomationStudioInRunRepair({ context: learning.context, graphOptions: learning.graphOptions, ports: learning.ports, runId: IN_RUN_REPAIR_RUN_ID, now: () => 100 });
    const first = await learning.graphOptions.learnInterruption!(learningRequest());
    if (first.kind !== "overlay") throw new Error("First layer was not learned.");
    const second = await learning.graphOptions.learnInterruption!({ ...learningRequest(), graph: first.graph, layer: other });
    if (second.kind !== "overlay") throw new Error("Second layer was not learned.");
    expect(second.repairId).not.toBe(first.repairId);
    expect(context.inRunRepairs?.receipts()).toHaveLength(2);
    expect(learning.adaptations.size).toBe(2);
    const detail = runtimeRunDetailWithAdaptationContext(emptyDetail(), context);
    expect(new Set(detail.interventions.map((intervention) => intervention.interventionId)).size).toBe(4);
    expect(first.repairId).toMatch(/^learn\.[a-f0-9]{64}$/u);
    expect(new Set(context.inRunRepairs?.overlays().map((overlay) => overlay.repairId)).size).toBe(2);
    expect(second.graph.nodes.filter((node) => node.definitionId === "builtin.control.handler")).toHaveLength(2);
  });

  it("is not supplied on a run that keeps no adaptations", () => {
    const learning = world({ behavior: { createAdaptations: false } });
    const context = bindAutomationStudioInRunRepair({ context: learning.context, graphOptions: learning.graphOptions, ports: learning.ports, runId: IN_RUN_REPAIR_RUN_ID });
    expect(learning.graphOptions.learnInterruption).toBeUndefined();
    expect(context).toBe(learning.context);
  });

  it.each([
    { status: "succeeded" as const, verdict: "answers", apply: true },
    { status: "failed" as const, verdict: "answers", apply: false },
    { status: "succeeded" as const, verdict: "does_not_answer", apply: false },
    { status: "succeeded" as const, verdict: undefined, apply: false }
  ])("settles the learned handler only on a successful judged answer: $status / $verdict", async ({ status, verdict, apply }) => {
    const learning = world({ behavior: { invokeLlm: false } });
    const context = bindAutomationStudioInRunRepair({ context: learning.context, graphOptions: learning.graphOptions, ports: learning.ports, runId: IN_RUN_REPAIR_RUN_ID });
    const answer = await learning.graphOptions.learnInterruption!(learningRequest());
    if (answer.kind !== "overlay") throw new Error("Layer was not learned.");
    const detail = runtimeRunDetailWithAdaptationContext(emptyDetail(), context);
    const applied: string[] = [];
    await settleAutomationStudioJudgedPromotions({
      projectId: IN_RUN_REPAIR_PROJECT_ID,
      flowId: IN_RUN_REPAIR_FLOW_ID,
      session: { runId: IN_RUN_REPAIR_RUN_ID, status, trace: { repairs: [answer.repairId] }, metadata: { resultVerification: { performed: verdict !== undefined, ...(verdict ? { verdict } : {}) } } },
      detail,
      ports: {
        getFlowAdaptation: async (_project, _flow, id) => learning.adaptations.get(id) ?? null,
        saveFlowAdaptation: learning.ports.saveFlowAdaptation,
        applyFlowAdaptation: async ({ adaptationId }) => {
          applied.push(adaptationId);
          return learning.adaptations.get(adaptationId)!;
        }
      }
    });
    expect(applied.length).toBe(apply ? 1 : 0);
    const [adaptation] = [...learning.adaptations.values()];
    expect(adaptation?.metadata?.approvalDecision).toMatchObject({ applied: apply, judgedRunId: IN_RUN_REPAIR_RUN_ID });
    expect(learning.requests).toHaveLength(0);
  });
});
