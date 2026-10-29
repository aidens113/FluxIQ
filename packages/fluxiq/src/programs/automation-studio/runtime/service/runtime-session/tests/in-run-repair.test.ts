// The run session's in-run repair (state-aware recovery plan, C6 step 8): the
// one recovery pipeline (diagnosis at `gather`, the deterministic plan, the
// patch at `implement`) run once per incident at the failing step, an overlay or
// a plain `none`, the run's one cost ceiling, and the records that wait for the
// judged end.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode, AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../../../executor/index.ts";
import type { AutomationStudioFactCondition } from "../../../executor/lifecycle/index.ts";
import type { AutomationStudioIncidentRepair } from "../../../executor/lifecycle-run/index.ts";
import { annotateAutomationStudioRunDetailWithRuntimeLlm } from "../../../recovery/index.ts";
import { AutomationStudioFlowBootstrapCreationSpendStore, AutomationStudioFlowPaths, AutomationStudioProjectPaths, type AutomationStudioProjectStore } from "../../index.ts";
import { bindAutomationStudioInRunRepair } from "../in-run-repair.ts";
import { AutomationStudioLlmRunPurse, AutomationStudioLlmRunBudgetLedger, type AutomationStudioLlmEvidenceRuntimeBinding, type AutomationStudioRuntimePatch } from "../../../llm/index.ts";
import {
  IN_RUN_REPAIR_FLOW_ID,
  IN_RUN_REPAIR_PROJECT_ID,
  IN_RUN_REPAIR_RUN_ID,
  IN_RUN_REPAIR_SUBFLOW_ID,
  inRunRepairGraph,
  inRunRepairHandlerPatch,
  inRunRepairRequest,
  inRunRepairWorld,
  type InRunRepairWorld
} from "./in-run-repair-fixture.ts";

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

// The ceilings below are sized for the off-peak rate. A call whose reply reports
// no usage is charged what it reserved, and a reservation is the call's worst
// case at the rate in force when it is held (`../../../recovery/annotation/run-budget.ts`,
// t254): the fixture's 40,000 input and 4,000 output tokens are $0.0168 at
// deepseek-flash's peak rate and $0.0084 off-peak. At peak a diagnosis and a
// patch reserve $0.0336 against a $0.02 purse, so the first incident's patch was
// refused and these tests failed only between 01:00-04:00 and 06:00-10:00 UTC on
// a weekday (t481). The run session hands the recovery no clock, so the wall
// clock is pinned here, to Monday 2026-10-12 12:00 UTC, off-peak.
const OFF_PEAK_MS = Date.UTC(2026, 9, 12, 12);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(OFF_PEAK_MS);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the in-run repair a run session supplies", () => {
  it("draws diagnosis and patch from the caller's run-owned canonical purse", async () => {
    const world = inRunRepairWorld();
    const runPurse = new AutomationStudioLlmRunPurse();
    bindAutomationStudioInRunRepair({ context: world.context, graphOptions: world.graphOptions, ports: world.ports, runId: IN_RUN_REPAIR_RUN_ID, runPurse });
    expect((await repair(world)).kind).toBe("overlay");
    expect(runPurse.current?.ledger.snapshot(IN_RUN_REPAIR_RUN_ID)).toMatchObject({ calls: 2, pendingCalls: 0 });
    expect(runPurse.current?.ledger.callRecords(IN_RUN_REPAIR_RUN_ID).calls.map((call) => call.taskKind)).toEqual(["runtime_diagnosis", "runtime_patch"]);
  });

  it("keeps records for separate incidents distinct at an identical timestamp", async () => {
    const world = inRunRepairWorld({ scripts: [{ patches: [inRunRepairHandlerPatch()] }, { patches: [inRunRepairHandlerPatch()] }] });
    bind(world);
    const first = await repair(world, inRunRepairRequest({ incidentId: "incident.first" }));
    const second = await repair(world, inRunRepairRequest({ incidentId: "incident.second" }));
    expect(first.kind).toBe("overlay");
    expect(second.kind).toBe("overlay");
    expect(world.adaptations.size).toBe(2);
    expect(new Set(world.proposals.map((proposal) => proposal.proposalId)).size).toBe(2);
    for (const proposal of world.proposals) {
      expect(world.adaptations.get(proposal.sourceAdaptationId!)?.proposalId).toBe(proposal.proposalId);
    }
  });

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
    const kept = inRunRepairWorld({ behavior: { createAdaptations: false } });
    expect(bind(kept)).toBe(kept.context);
    expect(kept.graphOptions.repairIncident).toBeUndefined();
    expect(kept.graphOptions.learnInterruption).toBeUndefined();
    // A run that asks no model repairs nothing at a failing step, and still learns a layer the defence closed (t516).
    const modelFree = inRunRepairWorld({ behavior: { invokeLlm: false } });
    expect(bind(modelFree).inRunRepairs).toBeDefined();
    expect(modelFree.graphOptions.repairIncident).toBeUndefined();
    expect(modelFree.graphOptions.learnInterruption).toBeTypeOf("function");
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

// t787 (debug run-mvskptb1, fix 2): an in-run handler's conditions wrote `fact` as a description, where a host reads a kind
// (`visible`, `absent`, `text` ...); the host answered `unknown`, so the handler never ran. The host here reads facts that way, its
// domain resolves t5 (the layer) as a fact's target and t6 (its close control) as a step's, and `described` writes as that model did.
describe("an in-run handler held to what the run can read", () => {
  const press = (elementId: JsonObject[string]): JsonObject => ({ outputId: "activate-element", parameters: { elementId } });
  const handlerPatch = (when: AutomationStudioFactCondition[], completionCheck: AutomationStudioFactCondition[]): AutomationStudioRuntimePatch => ({
    kind: "add_handler", reason: "A layer covers the step; close it with its own control, then take the step again.", event: "before", scope: { kind: "nodes", nodeIds: ["act"] },
    when, completionCheck, steps: [{ definitionId: "builtin.policy.action", parameters: press({ handle: "t6" }) }], then: { kind: "resume" }, consequences: []
  });
  const resolving: NonNullable<AutomationStudioLlmEvidenceRuntimeBinding["resolvePlanNodeParameters"]> = async ({ parameters }) => {
    const text = JSON.stringify(parameters);
    if (text.includes('{"handle":"t5"}')) return { status: "resolved", parameters: { selector: "#layer" } };
    if (text.includes('{"handle":"t6"}')) return { status: "resolved", parameters: JSON.parse(text.replace('{"handle":"t6"}', '"close"')) as JsonObject };
    return text.includes('"handle"') ? { status: "refused", issueCodes: ["test.handle.unknown"] } : { status: "unchanged" };
  };
  /** A page whose layer covers `act` until `close` is pressed, and whose host reads a fact by the kind it names, as a domain does. */
  function layerPage() {
    const state = { layer: true, presses: [] as string[] };
    const read = ({ fact, target }: AutomationStudioFactCondition): "true" | "false" | "unknown" => {
      if (target?.selector !== "#layer" || !["visible", "exists", "absent"].includes(fact)) return "unknown";
      return (fact === "absent") !== state.layer ? "true" : "false";
    };
    const covered = { status: "failed", route: "failed", message: "A layer covers the step.", failure: { category: "unexpected_state", code: "test.target.covered", retryable: false, stage: "execution", effect: "unacted" } } as const;
    const options: AutomationStudioGraphExecutionOptions = {
      delay: async () => undefined, now: () => 1_000, currentSubflowId: IN_RUN_REPAIR_SUBFLOW_ID,
      hostRuntime: { capabilities: ["fact-evaluation"], factEvaluator: (conditions) => conditions.map((condition) => ({ result: read(condition), capturedAt: 1_000 })) },
      effectDispatcher: (effect) => {
        const id = /"elementId":"([^"]+)"/u.exec(JSON.stringify(effect.payload ?? null))?.[1] ?? "?";
        state.presses.push(id);
        if (id === "close") state.layer = false;
        return state.layer ? covered : { status: "success", route: "success", outputs: { ok: true } };
      }
    };
    return { state, options };
  }
  function layerGraph(): AutomationStudioFlowDocument {
    const graph = inRunRepairGraph();
    const act: AutomationStudioFlowNode = { id: "act", definitionId: "builtin.policy.action", parameterValues: press("act"), metadata: { onFailure: "stop" } };
    const edge = (from: string, to: string) => ({ id: `${from}.${to}`, sourceNodeId: from, sourcePortId: "success", targetNodeId: to, targetPortId: "in" });
    return { ...graph, nodes: [{ id: "start", definitionId: "builtin.control.start" }, act, graph.nodes[2]!], edges: [edge("start", "act"), edge("act", "end")] };
  }
  const resolvingIn = (world: InRunRepairWorld): InRunRepairWorld => ({ ...world, ports: { ...world.ports, llmEvidenceRuntime: { ...world.ports.llmEvidenceRuntime!, resolvePlanNodeParameters: resolving } } });
  const layerWorld = (patch: AutomationStudioRuntimePatch): InRunRepairWorld => resolvingIn(inRunRepairWorld({ scripts: [{ patches: [patch] }] }));
  const described = (op: "visible" | "absent"): AutomationStudioFactCondition => ({ fact: "layer covering the step's control", op, target: { handles: { element: "t5" } } });

  it("an add_handler before the failed step whose layer is visible runs before the re-attempt", async () => {
    const world = layerWorld(handlerPatch([described("visible")], [described("absent")]));
    bind(world);
    const { state, options } = layerPage();
    const trace = await runAutomationStudioGraph(layerGraph(), { ...world.graphOptions, ...options });
    expect(trace.status).toBe("succeeded");
    // The failed attempt, the handler's press of the layer's own control, the re-attempt that lands; saved as the host reads it.
    expect(state.presses).toEqual(["act", "close", "act"]);
    const handler = `node.runtime-patch.${IN_RUN_REPAIR_RUN_ID}.handler-act`;
    expect(trace.attempts.map((attempt) => [attempt.nodeId, attempt.status])).toEqual([["start", "succeeded"], ["act", "failed"], [`${handler}.step-1`, "succeeded"], [`${handler}.end`, "succeeded"], ["act", "succeeded"], ["end", "succeeded"]]);
    expect(trace.handlerExecutions?.map((record) => [record.event, record.nodeId, record.disposition.kind])).toEqual([["before", "act", "resume"]]);
    const [adaptation] = [...world.adaptations.values()];
    expect(JSON.stringify(adaptation?.patch)).toContain(JSON.stringify([{ fact: "visible", op: "visible", target: { selector: "#layer" } }]));
  });

  it("refuses at apply a handler whose condition compares something it names only in its own words, and records why", async () => {
    const compared: AutomationStudioFactCondition = { fact: "the words on the layer", op: "contains", value: "expires", target: { handles: { element: "t5" } } };
    const world = layerWorld(handlerPatch([compared], [described("absent")]));
    const context = bind(world);
    const answer = await repair(world, inRunRepairRequest({ nodeId: "act", graph: layerGraph() }));
    const reason = "The fix's situation compares something it describes only in its own words, which the run cannot read, so the fix was not used. A condition that compares names what it reads: text for a control's shown words, value for a field's value.";
    expect(answer).toEqual({ kind: "none", reason });
    expect(context.inRunRepairs?.receipts()).toEqual([expect.objectContaining({ outcome: "none", code: "step_unresolved", reason, issueCodes: ["recovery.fact_kind_unread"] })]);
    expect(world.adaptations.size).toBe(0);
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

// t438: in a Lab-scoped run a Flow has one purse. The user's words
// (2026-10-01): "bring the ceiling down to $0.1 per flow max". Every call an
// in-run repair makes is added to the Flow's record as it settles, and each
// incident is held to what the Flow has left when it is asked, not once per run.
describe("the in-run repair of a Lab-scoped run", () => {
  const memoryStore = async (spentUsd: number) => {
    const projectPaths = new AutomationStudioProjectPaths(undefined);
    const store = new AutomationStudioFlowBootstrapCreationSpendStore(projectPaths, new AutomationStudioFlowPaths(projectPaths), {} as unknown as AutomationStudioProjectStore);
    if (spentUsd > 0) await store.add(IN_RUN_REPAIR_PROJECT_ID, IN_RUN_REPAIR_FLOW_ID, spentUsd);
    return store;
  };
  const underFlow = async <T>(store: AutomationStudioFlowBootstrapCreationSpendStore, run: () => Promise<T>) => await store.withFlowPurse(IN_RUN_REPAIR_PROJECT_ID, IN_RUN_REPAIR_FLOW_ID, 0.04, run);

  it("restores prior .06 spend under the run's global .10 while only NEW repair draws on the Flow's .04 remainder", async () => {
    const store = await memoryStore(0.06);
    const ledger = new AutomationStudioLlmRunBudgetLedger({ maxTotalTokensPerRun: 100_000, maxOutputTokensPerRun: 50_000, maxEstimatedCostUsdPerRun: 0.1 });
    const prior = ledger.reserve({ runId: IN_RUN_REPAIR_RUN_ID, requestId: "prior.check", estimatedInputTokens: 1, maxOutputTokens: 1, maxEstimatedCostUsd: 0.06 });
    if (prior.ok) prior.lease.complete({ inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0.06 });
    const runPurse = new AutomationStudioLlmRunPurse({ runId: IN_RUN_REPAIR_RUN_ID, gate: { costAccounting: ledger.snapshot(IN_RUN_REPAIR_RUN_ID), providerCalls: ledger.callRecords(IN_RUN_REPAIR_RUN_ID).calls, providerCallsOmitted: 0 } });
    const world = inRunRepairWorld({ scripts: [{ patches: [inRunRepairHandlerPatch()], costUsd: 0.005 }], policy: { maxEstimatedCostUsdPerRun: 0.1 } });
    bindAutomationStudioInRunRepair({ context: world.context, graphOptions: world.graphOptions, ports: world.ports, runId: IN_RUN_REPAIR_RUN_ID, runPurse });
    const answer = await store.withFlowPurse(IN_RUN_REPAIR_PROJECT_ID, IN_RUN_REPAIR_FLOW_ID, 0.1, async () => await repair(world));
    expect(answer.kind).toBe("overlay");
    expect(runPurse.current?.budget.ledger.maxEstimatedCostUsdPerRun).toBe(0.1);
    expect(runPurse.current?.ledger.snapshot(IN_RUN_REPAIR_RUN_ID)).toMatchObject({ calls: 3, pendingCalls: 0 });
    expect(runPurse.diagnostic).toBeUndefined();
  });

  it("draws only on what the Flow's creation left, and adds what it spent to the Flow's record", async () => {
    const store = await memoryStore(0.02);
    const world = inRunRepairWorld({ scripts: [{ patches: [inRunRepairHandlerPatch()], costUsd: 0.02 }, { patches: [inRunRepairHandlerPatch()] }], policy: { maxEstimatedCostUsdPerRun: 0.04 } });
    const context = bind(world);
    const [first, later] = await underFlow(store, async () => [await repair(world), await repair(world, inRunRepairRequest({ incidentId: "incident.2" }))]);
    expect(first?.kind).toBe("overlay");
    expect(store.spentNowUsd(IN_RUN_REPAIR_PROJECT_ID, IN_RUN_REPAIR_FLOW_ID)).toBe(0.04);
    // The first incident spent what the creation left, so the second asks no model.
    expect(later?.kind).toBe("none");
    expect(taskKinds(world)).toEqual(["runtime_diagnosis", "runtime_patch"]);
    expect(context.inRunRepairs?.recoveries().at(-1)?.metadata.llmGate).toMatchObject({ invoked: false, bound: "cost" });
  });

  it("re-reads what the Flow has left at each incident: what another part spent in between is taken out", async () => {
    const store = await memoryStore(0);
    const world = inRunRepairWorld({ scripts: [{ patches: [inRunRepairHandlerPatch()], costUsd: 0.01 }, { patches: [inRunRepairHandlerPatch()] }], policy: { maxEstimatedCostUsdPerRun: 0.04 } });
    const context = bind(world);
    const later = await underFlow(store, async () => {
      expect((await repair(world)).kind).toBe("overlay");
      // A re-author's build spends the rest of the Flow's ceiling between the two incidents.
      await store.add(IN_RUN_REPAIR_PROJECT_ID, IN_RUN_REPAIR_FLOW_ID, 0.03);
      return await repair(world, inRunRepairRequest({ incidentId: "incident.2" }));
    });
    expect(later.kind).toBe("none");
    expect(taskKinds(world)).toEqual(["runtime_diagnosis", "runtime_patch"]);
    expect(context.inRunRepairs?.recoveries().at(-1)?.metadata.llmGate).toMatchObject({ invoked: false, bound: "cost" });
  });

  it("asks no model once the Flow's creation spent its ceiling", async () => {
    const store = await memoryStore(0.04);
    const world = inRunRepairWorld({ policy: { maxEstimatedCostUsdPerRun: 0.04 } });
    bind(world);
    expect((await underFlow(store, async () => await repair(world))).kind).toBe("none");
    expect(world.requests).toHaveLength(0);
    expect(world.adaptations.size).toBe(0);
  });
});
