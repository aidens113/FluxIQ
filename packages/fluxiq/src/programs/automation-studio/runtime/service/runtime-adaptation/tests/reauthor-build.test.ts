import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowInstruction, AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import {
  automationStudioFlowBootstrapFailureState,
  AutomationStudioFlowBootstrapGenerationError,
  flowBootstrapBuildEndingFailure,
  type AutomationStudioFlowBootstrapBuildEnding,
  type AutomationStudioFlowBootstrapFailureDiagnostic
} from "../../../flow-bootstrap/generation-failure/index.ts";
import {
  automationStudioRefutedResultReauthored,
  type AutomationStudioResultRepairPurse
} from "../../../recovery/refuted-result/index.ts";
import { automationStudioReauthorBuild, type AutomationStudioReauthorBuildDependencies, type AutomationStudioReauthorBuilt } from "../index.ts";
import type { AutomationStudioGenerateFlowBootstrapAdaptationResult } from "../../flow-bootstrap-commands/index.ts";

const ACCOUNTING = { requestId: "request.c5", estimatedInputTokens: 10, inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.02 };
const BRIEF: AutomationStudioFlowInstruction = { schemaVersion: "0.1", instructionId: "instruction.c5", title: "Repair", body: "Keep the requested records.", scope: { kind: "flow", projectId: "project.c5", flowId: "flow.c5" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1 };

function detail(): AutomationStudioFlowRunDetail {
  return {
    schemaVersion: "0.1",
    summary: { schemaVersion: "0.1", runId: "run.c5", flowId: "flow.c5", projectId: "project.c5", status: "failed", updatedAt: 3, routeDecisionCount: 0, subflowEntryCount: 0, actionAttemptCount: 0, interventionCount: 0, adaptationCount: 0 },
    routeDecisions: [], subflows: [], actionAttempts: [], interventions: [], adaptationIds: [], changeProposalIds: [], metadata: {}
  };
}

function purse(limitUsd = 0.1): AutomationStudioResultRepairPurse {
  return { limitUsd, spentUsd: 0, unreportedParts: 0, averagedCalls: 0, averagedUsd: 0, refusedParts: [] };
}

function failure(code: string, stage: AutomationStudioFlowBootstrapFailureDiagnostic["stage"] = "provider_request", providerStatus?: number): AutomationStudioFlowBootstrapGenerationError {
  const state = automationStudioFlowBootstrapFailureState(code, stage, providerStatus);
  return new AutomationStudioFlowBootstrapGenerationError({
    code, stage, retryable: state.retryable, providerInvocation: state.providerInvocation, providerResponse: state.providerResponse,
    ...(state.accounting !== "absent" ? { accounting: { ...ACCOUNTING, ...(providerStatus === undefined ? {} : { providerStatus }) } } : {})
  });
}

function ending(kind: AutomationStudioFlowBootstrapBuildEnding["kind"], route?: "no_progress" | "repeated_unchanged"): AutomationStudioFlowBootstrapGenerationError {
  return flowBootstrapBuildEndingFailure({
    kind, message: "The kept draft can be continued.", notDone: [{ id: "a1", quote: "Keep records", todo: "needs_step" }],
    ...(kind === "budget_exhausted" ? { bound: "cost" } : {}),
    tried: { rounds: 1, decisions: 1, stepsInFlow: 1, tested: "replay_failed", ...(route ? { noRoute: { kind: route } } : {}) }
  }, { accounting: { iterations: 1, toolCalls: 0, evidenceBytes: 0, inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.02 }, trace: [] }, ACCOUNTING);
}

function generated(): AutomationStudioGenerateFlowBootstrapAdaptationResult {
  return { projectId: "project.c5", flowId: "flow.c5", adaptationId: "adaptation.c5", status: "proposed", riskLevel: "low", sourceInstructionIds: [BRIEF.instructionId], baseDependencyDigest: "digest.c5", baseSettingsRevision: 1, accounting: ACCOUNTING };
}

async function run(generate: AutomationStudioReauthorBuildDependencies["generate"], options: { limit?: number; approve?: AutomationStudioReauthorBuildDependencies["approve"]; apply?: AutomationStudioReauthorBuildDependencies["apply"] } = {}) {
  const record = vi.fn((current: AutomationStudioFlowRunDetail, built: AutomationStudioReauthorBuilt) => automationStudioRefutedResultReauthored({
    detail: current, decision: { route: true, projectId: "project.c5", flowId: "flow.c5" }, ...built
  }));
  const approve = options.approve ?? vi.fn(async () => undefined);
  const apply = options.apply ?? vi.fn(async () => undefined);
  const result = await automationStudioReauthorBuild({
    deps: { caller: { actorUserId: "user.c5", actorSessionId: "session.c5" }, generate, approve, apply },
    projectId: "project.c5", flowId: "flow.c5", brief: BRIEF, purse: purse(options.limit), detail: detail(), record, now: () => 1
  });
  return { ...result, record, approve, apply };
}

describe("local automatic reauthor retry", () => {
  it.each([
    ["budget_exhausted", undefined], ["not_finished", "no_progress"], ["not_finished", "repeated_unchanged"],
    ["replies_unreadable", undefined], ["provider_unavailable", undefined]
  ] as const)("keeps public retryable %s/%s without a second unchanged build", async (kind, route) => {
    const error = ending(kind, route);
    expect(error.diagnostic.retryable).toBe(true);
    const generate = vi.fn<AutomationStudioReauthorBuildDependencies["generate"]>().mockRejectedValue(error);
    const result = await run(generate);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.record).toHaveBeenCalledTimes(1);
    expect(result.built.failure).toMatchObject({ code: error.diagnostic.code, retryable: true, ending: { kind } });
    expect(result.purse.spentUsd).toBe(0.02);
    expect(result.detail.metadata?.resultReauthor).toMatchObject({ attempts: [{ code: error.diagnostic.code, accounting: { estimatedCostUsd: 0.02 } }] });
  });

  it("does not rebuild an iteration-limited draft even though it remains retryable", async () => {
    const error = failure("flow_bootstrap.evidence_iteration_limit", "provider_output_validation");
    error.diagnostic.evidenceLoop = { iterationCount: 1, decisionCount: 1, toolCallCount: 0, evidenceBytes: 0, exhausted: { bound: "iterations", maxIterations: 1, iterations: 1, draftSteps: 1, proposableSteps: 1, completionAttempts: 0 } };
    const generate = vi.fn<AutomationStudioReauthorBuildDependencies["generate"]>().mockRejectedValue(error);
    const result = await run(generate);
    expect(result.built.failure).toMatchObject({ code: error.diagnostic.code, retryable: true });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.record).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["flow_bootstrap.provider_rate_limited", 429], ["flow_bootstrap.provider_timeout", undefined],
    ["flow_bootstrap.provider_network_error", undefined], ["flow_bootstrap.provider_http_error", 503]
  ] as const)("retries canonical transient %s only once with the reduced purse", async (code, status) => {
    const error = failure(code, "provider_request", status);
    expect(error.diagnostic.retryable).toBe(true);
    const generate = vi.fn<AutomationStudioReauthorBuildDependencies["generate"]>().mockRejectedValue(error);
    const result = await run(generate);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls.map(call => call[2])).toEqual([0.1, 0.08]);
    expect(result.record).toHaveBeenCalledTimes(2);
    expect(result.purse.spentUsd).toBe(0.04);
    expect(result.detail.metadata?.resultReauthor).toMatchObject({ attempts: [{ code, accounting: { estimatedCostUsd: 0.02 } }, { code, accounting: { estimatedCostUsd: 0.02 } }] });
    expect(result.approve).not.toHaveBeenCalled();
    expect(result.apply).not.toHaveBeenCalled();
  });

  it.each([
    ["flow_bootstrap.provider_auth_failed", 401], ["flow_bootstrap.provider_http_error", 400],
    ["flow_bootstrap.provider_http_error", undefined], ["flow_bootstrap.provider_transport_unknown", undefined],
    ["flow_bootstrap.provider_aborted", undefined], ["flow_bootstrap.internal_error", undefined],
    ["flow_bootstrap.unexpected_error", undefined], ["flow_bootstrap.provider_configuration_invalid", undefined],
    ["flow_bootstrap.provider_response_malformed", undefined]
  ] as const)("does not retry %s/%s", async (code, status) => {
    const stage = code === "flow_bootstrap.provider_response_malformed" ? "provider_output_validation" : "provider_request";
    const error = failure(code, stage, status);
    const generate = vi.fn<AutomationStudioReauthorBuildDependencies["generate"]>().mockRejectedValue(error);
    const result = await run(generate);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.record).toHaveBeenCalledTimes(1);
    expect(result.built.failure).toMatchObject({ code, retryable: false });
  });

  it("refuses another provider request after a transient spends the remaining purse", async () => {
    const error = failure("flow_bootstrap.provider_timeout");
    error.diagnostic.accounting = { ...ACCOUNTING, estimatedCostUsd: 0.1 };
    const generate = vi.fn<AutomationStudioReauthorBuildDependencies["generate"]>().mockRejectedValue(error);
    const result = await run(generate);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.record).toHaveBeenCalledTimes(2);
    expect(result.purse.spentUsd).toBe(0.1);
    expect(result.built.failure?.code).toBe("llm_budget.run_cost_limit");
  });

  it.each(["approve", "apply"] as const)("never rebuilds a generated adaptation when %s fails", async failedPart => {
    const generate = vi.fn<AutomationStudioReauthorBuildDependencies["generate"]>().mockResolvedValue(generated());
    const reject = vi.fn(async () => { throw failure("flow_bootstrap.provider_timeout"); });
    const result = await run(generate, { [failedPart]: reject });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.record).toHaveBeenCalledTimes(1);
    expect(result.built).toMatchObject({ adaptationId: "adaptation.c5", failure: { retryable: true } });
    expect(result.purse.spentUsd).toBe(0.02);
  });

  it("keeps internal provider resend inside one logical generate and reported call charge", async () => {
    let requests = 0;
    const generate = vi.fn<AutomationStudioReauthorBuildDependencies["generate"]>(async () => {
      requests++; // transient HTTP attempt handled internally by this provider
      requests++; // same logical request's resend
      return generated();
    });
    const result = await run(generate);
    expect(requests).toBe(2);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.record).toHaveBeenCalledTimes(1);
    expect(result.built.applied).toBe(true);
    expect(result.purse.spentUsd).toBe(0.02);
  });
});
