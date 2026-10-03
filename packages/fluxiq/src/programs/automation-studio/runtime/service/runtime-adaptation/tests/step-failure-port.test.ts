// A step that failed on a changed site, and that the patch ladder could not
// repair, is re-authored (t193-wK cause C2). In 13 live runs the ladder ended
// with no executed patch -- the model said the goal was gone, asked for none,
// or returned a target override the domain refused -- and the run simply failed.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowInstruction, AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import { flowBootstrapPhaseFailure } from "../../../flow-bootstrap/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD } from "../../../llm/index.ts";
import { AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY, automationStudioStepFailureReauthorDecision } from "../../../recovery/refuted-result/index.ts";
import { automationStudioStepFailureRepairPort, type AutomationStudioStepFailureRepairPortDependencies } from "../step-failure-port.ts";

const caller = { actorUserId: "user.one", actorSessionId: "session.one" };

const flow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1", flowId: "flow.one", ownerKind: "task", ownerId: "task.one", name: "Post", createdAt: 1, updatedAt: 1, edges: [],
  nodes: [
    { id: "s3", definitionId: "web.action.navigate" },
    { id: "s4", definitionId: "web.action.click", label: "Open the post composer", parameterValues: { target: { name: "Write something...", role: "button" }, selector: "[data-testid=composer]" } }
  ]
};

/** A run whose step `s4` failed `target_not_found`, and whose ladder ran and ended as `gate` and `extra` say. */
function failedDetail(gate: JsonObject = {}, extra: JsonObject = {}): AutomationStudioFlowRunDetail {
  return {
    schemaVersion: "0.1",
    summary: { schemaVersion: "0.1", runId: "run.one", flowId: "flow.one", projectId: "project.one", status: "failed", updatedAt: 3, routeDecisionCount: 0, subflowEntryCount: 0, actionAttemptCount: 2, interventionCount: 1, adaptationCount: 0 },
    routeDecisions: [], subflows: [], interventions: [], adaptationIds: [], changeProposalIds: [],
    actionAttempts: [
      { attemptId: "attempt.1", nodeId: "s3", definitionId: "web.action.navigate", order: 1, status: "succeeded", startedAt: 1 },
      {
        attemptId: "attempt.2", nodeId: "s4", definitionId: "web.action.click", order: 2, status: "failed", startedAt: 2,
        failure: { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution", expected: "Write something... at [data-testid=composer]", actual: "7 same-family candidates, best -0.12" },
        metadata: { targetResolution: { status: "not_found", candidateCount: 7, confidence: -0.12 } }
      }
    ],
    metadata: {
      llmGate: { invoked: true, providerConfigured: true, ok: true, costAccounting: { calls: 3, estimatedCostUsd: 0.03 }, diagnostics: [], ...gate },
      ...extra
    }
  } as AutomationStudioFlowRunDetail;
}

const GOAL_GONE = { patchSkippedCode: "llm.runtime_patch_goal_unachievable", patchSkippedRung: "exploration" };
const OVERRIDE_REFUSED = { runtimePatchAttempts: [{ kind: "temporary_target_override", executed: false, preflightOk: false, targetOverrideRefusal: { status: "refused", reason: "target_unanchored" }, traceStatus: "not-run" }] };

type Spies = { generate: ReturnType<typeof vi.fn>; approve: ReturnType<typeof vi.fn>; apply: ReturnType<typeof vi.fn> };

function deps(overrides: Partial<AutomationStudioStepFailureRepairPortDependencies> = {}): AutomationStudioStepFailureRepairPortDependencies & Spies {
  return {
    projectId: "project.one",
    flowId: () => "flow.one",
    caller,
    generate: vi.fn(async () => ({ adaptationId: "adaptation.one", accounting: { estimatedCostUsd: 0.02 } })),
    approve: vi.fn(async () => undefined),
    apply: vi.fn(async () => undefined),
    now: () => 0,
    ...overrides
  } as AutomationStudioStepFailureRepairPortDependencies & Spies;
}

const repair = async (port: AutomationStudioStepFailureRepairPortDependencies, detail: AutomationStudioFlowRunDetail) =>
  await automationStudioStepFailureRepairPort(port)({ detail, flow, deniedEvidenceKeys: ["selector"] });

function marker(detail: AutomationStudioFlowRunDetail | undefined): Record<string, any> {
  return (detail?.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY] ?? {}) as Record<string, any>;
}

function briefOf(port: Spies): AutomationStudioFlowInstruction {
  return (port.generate.mock.calls[0] as unknown[])[1] as AutomationStudioFlowInstruction;
}

describe("a failed step the ladder could not repair", () => {
  it("is re-authored in extend mode when the model said the goal was gone, then approved and applied", async () => {
    const port = deps({ permittedConsequences: ["create_new"] });
    const result = await repair(port, failedDetail(GOAL_GONE));
    expect(port.generate).toHaveBeenCalledTimes(1);
    expect((port.generate.mock.calls[0] as unknown[])[0]).toEqual({ projectId: "project.one", flowId: "flow.one", mode: "extend", evidenceGuided: true, caller, permittedConsequences: ["create_new"] });
    expect(port.approve).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.one", adaptationId: "adaptation.one", actorId: "runtime.result_repair" });
    expect(port.apply).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.one", adaptationId: "adaptation.one", actorId: "runtime.result_repair" });
    expect(result?.reauthored).toBe(true);
    expect(marker(result?.detail)).toMatchObject({ routed: true, adaptationId: "adaptation.one", applied: true });
    expect(marker(result?.detail).attempts[0].brief).toMatchObject({
      trigger: "failed_step", nodeId: "s4", failureCategory: "target_not_found", failureCode: "web.target.not_found",
      ladder: { skipCode: "llm.runtime_patch_goal_unachievable", skipRung: "exploration" }
    });
  });

  // A rerun in the re-author puts the page back where its node started (t194 cause C-D, `run-murwcmx2`).
  it("hands the build where each node of the failed run started", async () => {
    const port = deps();
    const detail = failedDetail(GOAL_GONE);
    detail.actionAttempts![0]!.metadata = { stateRefs: { beforeAction: { stateSnapshotId: "s", stateRef: "r", capturedAt: 1, from: { location: "https://social.test/" } } } };
    await repair(port, detail);
    expect((port.generate.mock.calls[0] as unknown[])[3]).toEqual({ s3: { location: "https://social.test/" } });
  });

  it("is re-authored the same way when the domain refused the target override as unanchored", async () => {
    const port = deps();
    const result = await repair(port, failedDetail({}, OVERRIDE_REFUSED));
    expect(port.generate).toHaveBeenCalledTimes(1);
    expect(port.apply).toHaveBeenCalledTimes(1);
    expect(result?.reauthored).toBe(true);
    expect(marker(result?.detail).attempts[0].brief.ladder).toMatchObject({ targetRefusals: ["target_unanchored"], patchesRefused: 1 });
    expect(briefOf(port).body).toContain("target_unanchored");
  });

  it("briefs the build with the failed node, its failure and its screened target, and nothing locator-shaped", async () => {
    const port = deps();
    await repair(port, failedDetail(GOAL_GONE));
    const brief = briefOf(port);
    expect(brief.instructionId).toBe("core.step_failure_repair.brief");
    expect(brief.body).toContain("step s4");
    expect(brief.body).toContain("web.action.click");
    expect(brief.body).toContain("target_not_found (web.target.not_found)");
    expect(brief.body).toContain("Write something...");
    expect(brief.body).toContain("has changed since the Flow was built");
    expect(brief.body).toContain("Keep every other step exactly as it is");
    expect(brief.body).not.toContain("data-testid");
  });

  it("ends as today when the build builds nothing, with the attempt on the run", async () => {
    const port = deps({ generate: vi.fn(async () => { throw flowBootstrapPhaseFailure("provider_output_validation"); }) as never });
    const result = await repair(port, failedDetail(GOAL_GONE));
    expect(result?.reauthored).toBe(false);
    expect(port.apply).not.toHaveBeenCalled();
    expect(marker(result?.detail)).toMatchObject({ routed: true, code: "flow_bootstrap.provider_output_validation_failed" });
    expect(marker(result?.detail).applied).toBeUndefined();
    expect(marker(result?.detail).attempts.at(-1).brief.trigger).toBe("failed_step");
  });
});

describe("a failed run that is never re-authored", () => {
  it("leaves a run whose ladder patch executed to the ladder", async () => {
    const port = deps();
    const executed = failedDetail({}, { runtimePatchAttempts: [{ kind: "temporary_target_override", executed: true, preflightOk: true, traceStatus: "failed" }] });
    expect(await repair(port, executed)).toBeUndefined();
    expect(port.generate).not.toHaveBeenCalled();
  });

  it("leaves a run that stopped to ask the person", async () => {
    const port = deps();
    expect(await repair(port, failedDetail(GOAL_GONE, { permissionRequest: { schemaVersion: "automation-studio.action-permission-request.v1" } }))).toBeUndefined();
    expect(await repair(port, failedDetail({ patchSkippedCode: "llm.runtime_patch_permission_required" }))).toBeUndefined();
    expect(await repair(port, failedDetail({ patchDeclined: "person_required" }))).toBeUndefined();
    expect(port.generate).not.toHaveBeenCalled();
  });

  it("leaves a run a cost or budget bound stopped", async () => {
    const port = deps();
    expect(await repair(port, failedDetail({ ...GOAL_GONE, diagnostics: [{ code: "llm_budget.run_cost_limit", severity: "error", message: "spent" }] }))).toBeUndefined();
    expect(await repair(port, failedDetail({ invoked: false, code: "llm_budget.run_cost_limit", bound: "cost" }))).toBeUndefined();
    expect(port.generate).not.toHaveBeenCalled();
  });

  it("names why, reading only the run", () => {
    const decide = (detail: AutomationStudioFlowRunDetail) => automationStudioStepFailureReauthorDecision({ detail, projectId: "project.one", flowId: "flow.one" });
    const notTarget = failedDetail(GOAL_GONE);
    notTarget.actionAttempts![1]!.failure = { category: "timeout", code: "web.action.timeout", retryable: true };
    expect(decide(notTarget)).toEqual({ route: false, refusal: "not_target_level" });
    expect(decide({ ...failedDetail(GOAL_GONE), summary: { ...failedDetail().summary, status: "succeeded" } })).toEqual({ route: false, refusal: "run_not_failed" });
    expect(decide({ ...failedDetail(GOAL_GONE), actionAttempts: [] })).toEqual({ route: false, refusal: "no_failed_step" });
    expect(decide(failedDetail({ invoked: false, code: "llm.gate.training_mode" }))).toEqual({ route: false, refusal: "ladder_not_run" });
    expect(decide(failedDetail(GOAL_GONE, { adaptiveRetry: { attempted: true, status: "failed" } }))).toEqual({ route: false, refusal: "ladder_patch_executed" });
    expect(decide(failedDetail(GOAL_GONE, { recoveryTrace: { stages: [{ stage: "exploration", status: "failed", detail: { outcome: "budget_exhausted" } }] } }))).toEqual({ route: false, refusal: "cost_bound" });
    expect(automationStudioStepFailureReauthorDecision({ detail: failedDetail(GOAL_GONE) })).toEqual({ route: false, refusal: "flow_unavailable" });
  });

  it("re-authors a run once: a re-run that fails at a step again stands", async () => {
    const port = deps();
    const first = await repair(port, failedDetail(GOAL_GONE));
    const second = await repair(port, { ...failedDetail(GOAL_GONE), metadata: { ...failedDetail(GOAL_GONE).metadata, [AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]: marker(first?.detail) } });
    expect(second).toBeUndefined();
    expect(port.generate).toHaveBeenCalledTimes(1);
  });
});

// One purse for the whole repair: the ladder was its first part.
// Amounts are fractions of the run cost ceiling ($0.10 since 2026-10-01; was
// $0.25), so the scenarios hold whatever the ceiling is set to.
describe("what the re-author may spend", () => {
  const CEILING = AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD;

  it("hands the build only what the ladder left of the ceiling", async () => {
    const port = deps({ generate: vi.fn(async () => ({ adaptationId: "adaptation.one", accounting: { estimatedCostUsd: CEILING * 0.08 } })) as never });
    const result = await repair(port, failedDetail({ ...GOAL_GONE, costAccounting: { calls: 10, estimatedCostUsd: CEILING * 0.8 } }));
    expect(port.generate).toHaveBeenCalledTimes(1);
    expect((port.generate.mock.calls[0] as unknown[])[2]).toBeCloseTo(CEILING * 0.2, 9);
    // The build's own spend is charged to the same purse, which the run carries.
    expect(marker(result?.detail).purse).toMatchObject({ limitUsd: CEILING });
    expect(marker(result?.detail).purse.spentUsd).toBeCloseTo(CEILING * 0.88, 9);
  });

  it("is lowered by the Flow's own limit", async () => {
    const port = deps({ maxCostUsd: () => CEILING * 0.4 });
    await repair(port, failedDetail({ ...GOAL_GONE, costAccounting: { calls: 10, estimatedCostUsd: CEILING * 0.16 } }));
    expect((port.generate.mock.calls[0] as unknown[])[2]).toBeCloseTo(CEILING * 0.24, 9);
  });

  it("asks no model when the ladder left nothing, and names the cost bound", async () => {
    const port = deps();
    const result = await repair(port, failedDetail({ ...GOAL_GONE, costAccounting: { calls: 12, estimatedCostUsd: CEILING } }));
    expect(port.generate).not.toHaveBeenCalled();
    expect(result?.reauthored).toBe(false);
    expect(marker(result?.detail)).toMatchObject({ routed: true, code: "llm_budget.run_cost_limit", providerInvocation: "not_attempted" });
    expect(marker(result?.detail).purse).toMatchObject({ refusedParts: ["reauthor"], bound: "cost", leftUsd: 0 });
  });
});
