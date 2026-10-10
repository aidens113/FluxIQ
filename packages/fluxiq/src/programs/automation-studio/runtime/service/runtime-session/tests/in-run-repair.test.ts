// The run session's in-run repair (state-aware recovery plan, C6 step 8): the
// one recovery pipeline (diagnosis at `gather`, the deterministic plan, the
// patch at `implement`) run once per incident at the failing step, an overlay or
// a plain `none`, the run's one cost ceiling, and the records that wait for the
// judged end.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import type { AutomationStudioIncidentRepair } from "../../../executor/lifecycle-run/index.ts";
import { annotateAutomationStudioRunDetailWithRuntimeLlm } from "../../../recovery/index.ts";
import { bindAutomationStudioInRunRepair } from "../in-run-repair.ts";
import { IN_RUN_REPAIR_FLOW_ID, IN_RUN_REPAIR_PROJECT_ID, IN_RUN_REPAIR_RUN_ID, inRunRepairHandlerPatch, inRunRepairRequest, inRunRepairWorld, type InRunRepairWorld } from "./in-run-repair-fixture.ts";

function bind(world: InRunRepairWorld) {
  return bindAutomationStudioInRunRepair({ context: world.context, graphOptions: world.graphOptions, ports: world.ports, runId: IN_RUN_REPAIR_RUN_ID });
}

function taskKinds(world: InRunRepairWorld): string[] {
  return world.requests.map((request) => request.taskKind);
}

async function repair(world: InRunRepairWorld, request = inRunRepairRequest()): Promise<AutomationStudioIncidentRepair> {
  const repairIncident = world.graphOptions.repairIncident;
  if (!repairIncident) throw new Error("No repairIncident was supplied.");
  return await repairIncident(request);
}

describe("the in-run repair a run session supplies", () => {
  it("runs the diagnosis and then the patch request carrying the unit, its contract and the incident, and answers with the fix overlaid", async () => {
    const world = inRunRepairWorld();
    const context = bind(world);
    const request = inRunRepairRequest();
    const answer = await repair(world, request);

    // Today's two stages, once each: the diagnosis gathers, the patch implements.
    expect(taskKinds(world)).toEqual(["runtime_diagnosis", "runtime_patch"]);
    expect(world.requests[0]).toMatchObject({ taskKind: "runtime_diagnosis", context: { stage: "gather" } });
    expect(world.requests[0]?.context.inRunRepair).toBeUndefined();
    const asked = world.requests[1]!;
    expect(asked).toMatchObject({ taskKind: "runtime_patch", expectedOutput: "runtime_patch", context: { stage: "implement", nodeId: "read" } });
    const metadata = asked.metadata as JsonObject;
    expect(metadata.allowedPatchKinds).toEqual(expect.arrayContaining(["add_handler", "replace_unit", "temporary_target_override"]));
    // The repair rides in its own packet slot, which brings the instruction that explains it, not in `metadata`.
    expect(metadata).not.toHaveProperty("inRunRepair");
    expect(asked.context.inRunRepair).toMatchObject({
      unit: { kind: "node", id: "read" },
      contract: { kind: "node", nodeId: "read", definitionId: "builtin.data.constant", label: "Read the list", parameters: { values: { value: "read" } }, routes: [{ port: "success", to: "end" }] },
      incident: { incidentId: "incident.1", origin: { nodeId: "read", failureCode: "test.target.not_found" }, trueFailure: true },
      recoveriesTried: [{ kind: "retry", nodeId: "read", attemptNumber: 4 }],
      actsCompleted: [{ nodeId: "open", attemptId: "open.attempt.1" }]
    });
    // The live page, as the detached path captures it.
    expect(asked.context.failureEvidence).toMatchObject({ page: "page.failed" });

    expect(answer.kind).toBe("overlay");
    if (answer.kind !== "overlay") return;
    expect(answer.repairId).toBe(`repair.${IN_RUN_REPAIR_RUN_ID}.incident.1`);
    expect(answer.unit.kind).toBe("handler");
    expect(answer.graph.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(["open", "read", "end"]));
    expect(answer.graph.nodes.some((node) => node.definitionId === "builtin.control.handler")).toBe(true);
    // The request's graph is the run's; the fix is on a copy.
    expect(request.graph.nodes).toHaveLength(3);

    // Recorded as a pending adaptation of this run, with its review record, held for the judged end.
    const [adaptation] = [...world.adaptations.values()];
    expect(adaptation).toMatchObject({ sourceRunId: IN_RUN_REPAIR_RUN_ID, status: "testing", patch: [{ kind: "add_handler", targetId: "read" }], metadata: { approvalDecision: { autoApply: true, applyAt: "judged_whole_run", applied: false, runId: IN_RUN_REPAIR_RUN_ID } } });
    expect(world.proposals).toHaveLength(1);
    expect(adaptation?.proposalId).toBe(world.proposals[0]?.proposalId);
    expect(context.inRunRepairs?.receipts()).toEqual([expect.objectContaining({ repairId: answer.repairId, incidentId: "incident.1", outcome: "overlaid", kind: "add_handler", adaptationId: adaptation?.adaptationId, retryOriginalAction: false })]);
    // What the recovery recorded, for the run detail: both interventions, its gate and its four-stage trace.
    const [recovery] = context.inRunRepairs?.recoveries() ?? [];
    expect(recovery?.interventions.map((intervention) => intervention.promptVersion)).toEqual(["automation-studio.runtime-diagnosis.v1+stage.gather", "automation-studio.runtime-patch.v1+stage.implement+in_run_repair"]);
    expect(recovery?.adaptationIds).toEqual([adaptation?.adaptationId]);
    expect(recovery?.metadata).toMatchObject({ llmGate: { invoked: true, ok: true }, recoveryTrace: { stages: expect.any(Array) } });
  });

  it("asks once per incident, and answers none past the run's cost ceiling", async () => {
    const world = inRunRepairWorld({ scripts: [{ patches: [inRunRepairHandlerPatch()], costUsd: 0.02 }, { patches: [inRunRepairHandlerPatch()] }], policy: { maxEstimatedCostUsdPerRun: 0.02 } });
    const context = bind(world);
    const first = await repair(world);
    const again = await repair(world);
    const later = await repair(world, inRunRepairRequest({ incidentId: "incident.2" }));

    expect(first.kind).toBe("overlay");
    expect(again).toEqual({ kind: "none", reason: "This incident was already asked about once in this run." });
    // One purse for the run: the first incident spent it, so the second's diagnosis is refused before the provider and no patch is asked for.
    expect(later.kind).toBe("none");
    expect(taskKinds(world)).toEqual(["runtime_diagnosis", "runtime_patch"]);
    const refused = context.inRunRepairs?.recoveries().at(-1);
    expect(refused?.interventions).toEqual([expect.objectContaining({ kind: "diagnosis", validation: { ok: false, issues: [expect.stringContaining("llm_budget.run_cost_limit")] } })]);
    expect(context.inRunRepairs?.receipts().at(-1)).toMatchObject({ incidentId: "incident.2", outcome: "none", spent: { calls: 2, ceilingUsd: 0.02 } });
  });

  it("is not supplied at all on a run whose context does not adapt, or whose lane only diagnoses or proposes", () => {
    for (const behavior of [{ invokeLlm: false }, { createAdaptations: false }]) {
      const world = inRunRepairWorld({ behavior });
      const context = bind(world);

      expect(world.graphOptions.repairIncident).toBeUndefined();
      expect(context).toBe(world.context);
    }
    for (const intent of ["diagnosis_only", "diagnose_and_adapt"] as const) {
      const world = inRunRepairWorld();
      const context = bindAutomationStudioInRunRepair({ context: world.context, graphOptions: world.graphOptions, ports: world.ports, runId: IN_RUN_REPAIR_RUN_ID, llmExecution: { actorUserId: "user.test", actorSessionId: "session.test", intent } });

      expect(world.graphOptions.repairIncident).toBeUndefined();
      expect(context).toBe(world.context);
    }
    const asked = inRunRepairWorld();
    bindAutomationStudioInRunRepair({ context: asked.context, graphOptions: asked.graphOptions, ports: asked.ports, runId: IN_RUN_REPAIR_RUN_ID, llmExecution: { actorUserId: "user.test", actorSessionId: "session.test", intent: "explore_and_adapt" } });
    expect(asked.graphOptions.repairIncident).toBeTypeOf("function");
  });

  it("answers none, and keeps nothing, when the model declines or replaces a unit other than the one that failed", async () => {
    const declined = inRunRepairWorld({ scripts: [{ decline: true }] });
    bind(declined);
    const otherUnit = inRunRepairWorld({ scripts: [{ patches: [{ kind: "replace_unit", reason: "Replace the opening step.", unit: { kind: "node", nodeId: "open" }, steps: [{ definitionId: "builtin.data.constant" }], consequences: [] }] }] });
    const otherUnitContext = bind(otherUnit);

    expect(await repair(declined)).toEqual({ kind: "none", reason: "The model was asked for a fix to the failing step and declined." });
    expect(await repair(otherUnit)).toEqual({ kind: "none", reason: "The fix replaced a unit other than the one that failed." });
    expect(declined.adaptations.size + otherUnit.adaptations.size).toBe(0);
    // The refused answer is recorded as a patch that never ran, which never asks the detached path to run again.
    expect(otherUnitContext.inRunRepairs?.recoveries()[0]?.metadata.runtimePatchAttempts).toEqual([expect.objectContaining({ kind: "replace_unit", code: "other_unit", executed: false, retryOriginalAction: false, traceStatus: "not-run" })]);
  });

  // C12: a repair names one unit, the incident's. A fix to another node, or a
  // handler for other steps, is refused with its reason before anything is
  // recorded or overlaid, so the executor has no trial to run.
  it("answers none, records why, and overlays nothing for a fix to a unit other than the failing one", async () => {
    const otherNode = inRunRepairWorld({ scripts: [{ patches: [{ kind: "temporary_wait_retry", targetNodeId: "open", retryCount: 2, reason: "Wait longer on the opening step." }] }] });
    const otherScope = inRunRepairWorld({ scripts: [{ patches: [inRunRepairHandlerPatch({ scope: { kind: "nodes", nodeIds: ["open"] } })] }] });
    const contexts = [bind(otherNode), bind(otherScope)];

    expect(await repair(otherNode)).toEqual({ kind: "none", reason: "The fix changed a unit other than the one that failed." });
    expect(await repair(otherScope)).toEqual({ kind: "none", reason: "The fix added a handler for steps other than the one that failed." });
    for (const context of contexts) {
      expect(context.inRunRepairs?.receipts()).toEqual([expect.objectContaining({ incidentId: "incident.1", outcome: "none", code: "other_unit" })]);
      expect(context.inRunRepairs?.overlays()).toEqual([]);
      expect(context.inRunRepairs?.recoveries()[0]?.metadata.runtimePatchAttempts).toEqual([expect.objectContaining({ code: "other_unit", executed: false, traceStatus: "not-run" })]);
    }
    expect(otherNode.adaptations.size + otherScope.adaptations.size).toBe(0);
    expect(otherNode.proposals.length + otherScope.proposals.length).toBe(0);
  });

  it("overlays a fix to the failing node itself, and keeps the graph it left the frame running", async () => {
    const world = inRunRepairWorld({ scripts: [{ patches: [{ kind: "temporary_wait_retry", targetNodeId: "read", retryCount: 2, reason: "Wait longer on the list." }] }] });
    const context = bind(world);
    const answer = await repair(world);

    expect(answer).toMatchObject({ kind: "overlay", unit: { kind: "node", nodeId: "read" } });
    if (answer.kind !== "overlay") return;
    expect(answer.graph.nodes.find((node) => node.id === "read")?.parameterValues).toMatchObject({ retryCount: 2 });
    expect(context.inRunRepairs?.overlays()).toEqual([{ repairId: answer.repairId, framePath: ["frame.root"], graph: answer.graph }]);
  });

  it("answers none for a fix that would lastingly act and does not say how", async () => {
    const { consequences: _undeclared, ...silent } = inRunRepairHandlerPatch() as Extract<ReturnType<typeof inRunRepairHandlerPatch>, { kind: "add_handler" }>;
    const world = inRunRepairWorld({ scripts: [{ patches: [silent] }] });
    bind(world);

    expect(await repair(world)).toEqual({ kind: "none", reason: "The fix did not say what it would lastingly do, so it was not used." });
  });
});

describe("the detached recovery after a run that held", () => {
  it("asks no model about an incident the run already asked about in place", async () => {
    const world = inRunRepairWorld();
    const context = bind(world);
    await repair(world);
    const request = inRunRepairRequest();
    const detail = await annotateAutomationStudioRunDetailWithRuntimeLlm({ ports: world.ports, detail: failedDetail(), context, failedTraceAttempt: request.failedAttempt });
    const marked = await annotateAutomationStudioRunDetailWithRuntimeLlm({ ports: world.ports, detail: failedDetail(), context: world.context, failedTraceAttempt: { ...request.failedAttempt, repair: { unit: { kind: "node", nodeId: "read" }, outcome: "dropped", reason: "The fix's trial failed too." } } });

    expect(taskKinds(world)).toEqual(["runtime_diagnosis", "runtime_patch"]);
    expect(detail.metadata?.llmGate).toMatchObject({ invoked: false, code: "llm.gate.repaired_in_run" });
    expect(marked.metadata?.llmGate).toMatchObject({ invoked: false, code: "llm.gate.repaired_in_run" });
  });

  it("throws again a fault the held recovery could not finish on, so the run session ends the run on it", async () => {
    const world = inRunRepairWorld();
    world.ports.conversationForRecovery = async () => { throw new Error("The thread could not be read."); };
    const context = bind(world);
    const request = inRunRepairRequest();

    await expect(repair(world, request)).rejects.toThrow("The thread could not be read.");
    expect(world.requests).toEqual([]);
    await expect(annotateAutomationStudioRunDetailWithRuntimeLlm({ ports: world.ports, detail: failedDetail(), context, failedTraceAttempt: request.failedAttempt })).rejects.toThrow("The thread could not be read.");
  });
});

function failedDetail(): AutomationStudioFlowRunDetail {
  return {
    schemaVersion: "0.1",
    summary: { schemaVersion: "0.1", runId: IN_RUN_REPAIR_RUN_ID, flowId: IN_RUN_REPAIR_FLOW_ID, projectId: IN_RUN_REPAIR_PROJECT_ID, status: "failed", updatedAt: 50, routeDecisionCount: 0, subflowEntryCount: 0, actionAttemptCount: 2, interventionCount: 0, adaptationCount: 0 },
    routeDecisions: [],
    subflows: [],
    actionAttempts: [],
    recoveryAttempts: [],
    interventions: [],
    adaptationIds: [],
    changeProposalIds: []
  };
}
