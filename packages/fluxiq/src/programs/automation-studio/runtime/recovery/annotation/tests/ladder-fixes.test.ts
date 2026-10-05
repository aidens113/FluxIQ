// Two of the repair ladder's defects from t193 wK, driven through the whole
// recovery path: what the patch call is told it may write (C3), and a ladder
// with no failed attempt that billed a diagnosis anyway (C9). C5, the recovery
// context's byte budget, is a cap on what the model is shown and belongs to t200.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../executor.ts";
import { automationStudioRuntimePatchOutputSchema, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest, type AutomationStudioLlmTokenLimits } from "../../../llm/index.ts";
import { resolveAutomationStudioResultCheckSchedule } from "../../../result-check-schedule/index.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "../../../service.ts";
import { annotateAutomationStudioRunDetailWithRuntimeLlm } from "../annotate.ts";
import { adaptationPolicy } from "./annotate-harness.ts";

describe("the repair ladder's patch request and empty ladder", () => {
  it("keeps healed failure history and a genuinely failed terminal status without diagnosing the healed node", async () => {
    const requests: AutomationStudioLlmTaskRequest[] = [];
    let resolved = 0;
    const detail = await recover({ requests, healedAttempt: true, onResolve: () => { resolved += 1; } });
    expect(resolved).toBe(0);
    expect(requests).toHaveLength(0);
    expect(detail.summary.status).toBe("failed");
    expect(detail.actionAttempts?.map((attempt) => attempt.status)).toEqual(["failed", "succeeded"]);
    expect(detail.metadata?.llmGate).toMatchObject({ invoked: false, code: "llm.runtime_patch_no_failed_attempt" });
  });
  // C3. The plan for a `target_not_found` allows a target override and a wait
  // retry; the model was shown all five kinds and wrote ones the plan refused.
  it("tells the patch call the plan's allowed kinds, and the schema offers exactly those", async () => {
    const requests: AutomationStudioLlmTaskRequest[] = [];
    await recover({ requests });
    const patch = requests.find((request) => request.taskKind === "runtime_patch");

    expect(patch?.metadata?.allowedPatchKinds).toEqual(["temporary_target_override", "temporary_wait_retry"]);
    // The provider reads the declaration into the schema (`llm/deepseek/tests/output-schema.test.ts`).
    const schema = automationStudioRuntimePatchOutputSchema({ proposalOnly: false, allowedKinds: patch?.metadata?.allowedPatchKinds as string[] }) as { oneOf: Array<{ properties: { patches?: { items: { oneOf: Array<{ properties: { kind: { const: string } } }> } } } }> };
    expect(schema.oneOf[0]?.properties.patches?.items.oneOf.map((variant) => variant.properties.kind.const).sort()).toEqual(["temporary_target_override", "temporary_wait_retry"]);
  });

  // C9. Live run munyzo8z: no failed attempt, a billed diagnosis, then
  // `llm.runtime_patch_unavailable` at `resolution`.
  it("asks no model when no attempt failed, and says so under its own code at the diagnosis rung", async () => {
    const requests: AutomationStudioLlmTaskRequest[] = [];
    let resolved = 0;
    const detail = await recover({ requests, noFailedAttempt: true, onResolve: () => { resolved += 1; } });

    expect(requests).toHaveLength(0);
    expect(resolved).toBe(0);
    expect(detail.interventions).toEqual([]);
    expect(detail.metadata?.llmGate).toMatchObject({ invoked: false, code: "llm.runtime_patch_no_failed_attempt", patchSkippedCode: "llm.runtime_patch_no_failed_attempt", patchSkippedRung: "diagnosis" });
    const stages = (detail.metadata?.recoveryTrace as { stages?: JsonObject[] } | undefined)?.stages ?? [];
    expect(stages.every((stage) => stage.providerCalled === false)).toBe(true);
    expect(stages.find((stage) => stage.stage === "resolution")).toMatchObject({ detail: { skipCode: "llm.runtime_patch_no_failed_attempt" } });
  });
});

type RecoverOptions = {
  requests: AutomationStudioLlmTaskRequest[];
  tokenLimits?: AutomationStudioLlmTokenLimits;
  noFailedAttempt?: boolean;
  healedAttempt?: boolean;
  onResolve?: () => void;
};

async function recover(options: RecoverOptions): Promise<AutomationStudioFlowRunDetail> {
  const provider: AutomationStudioLlmProvider = {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async (request) => {
      options.requests.push(request);
      if (request.expectedOutput === "diagnosis") {
        return { response: { kind: "diagnosis", summary: "The action could not find its control.", diagnosis: { stillAchievable: "yes", patchNeeded: true, explorationNeeded: false } } };
      }
      return { response: { kind: "no_repair", summary: "Nothing here replaces it.", reason: "several_alike" } };
    }
  };
  const detail = runDetail(options.noFailedAttempt === true);
  if (options.healedAttempt) detail.actionAttempts!.push({ attemptId: "node.action.attempt.2", nodeId: "node.action", definitionId: "builtin.policy.action", order: 2, status: "succeeded", startedAt: 3, finishedAt: 4 });
  return await annotateAutomationStudioRunDetailWithRuntimeLlm({
    ports: {
      resolveLlmProvider: () => {
        options.onResolve?.();
        return { provider, maxCallsPerRun: 4, ...(options.tokenLimits ? { tokenLimits: options.tokenLimits } : {}) };
      },
      reusableLlmContextEnabled: false,
      flowInstructionSet: async () => [],
      reusableLlmContextForFreshEvidence: async () => undefined,
      flowForRecovery: async () => ({ scope: { kind: "domain", domainId: "test.domain" } }),
      saveFlowChangeProposal: async (proposal) => proposal,
      saveFlowAdaptation: async (adaptation) => adaptation,
      promoteRuntimeAdaptation: async (input) => input.adaptation
    },
    detail,
    context: context(),
    runtimeFlow: { schemaVersion: "0.1", flowId: "flow.recovery", ownerKind: "policy", ownerId: "project.recovery", name: "Recovery flow", nodes: [{ id: "node.action", definitionId: "builtin.policy.action" }], edges: [], createdAt: 1, updatedAt: 1 },
    ...(options.noFailedAttempt || options.healedAttempt ? {} : { failedTraceAttempt: failedAttempt() })
  });
}

function context(): AutomationStudioRuntimeAdaptationContext {
  return {
    projectId: "project.recovery",
    flowId: "flow.recovery",
    settings: {
      mode: "continuous_adaptive",
      allowLlmIntervention: true,
      allowRuntimeRecovery: true,
      allowAdaptationCreation: true,
      proposalApprovalMode: "auto",
      allowPromotion: true,
      budgets: { maxTokensPerRun: 200_000, exhaustedBehavior: "stop" }
    },
    policy: adaptationPolicy(false),
    behavior: { invokeLlm: true, runRecovery: true, createAdaptations: true, proposalApprovalMode: "auto", promoteAdaptations: false },
    metrics: { deterministicSuccessRuns: 0, llmInterventionsPerRun: 0, unresolvedFailures: 1, repeatedTriggers: [], acceptedAdaptations: 0, rejectedAdaptations: 0, stabilityScore: 0.5 },
    budgetState: { interventionsThisRun: 0, tokensThisRun: 0, costUsdThisTrainingWindow: 0 },
    budgetDecision: { ok: true, exhausted: [], behavior: "continue" },
    runsCompleted: 3,
    recentRunCount: 3,
    recentAdaptationCount: 0,
    recentAdaptations: [],
    resultCheckSchedule: resolveAutomationStudioResultCheckSchedule("initial_then_exponential"),
    resultCheckState: { ordinal: 1, lastCheckedOrdinal: null, checksPassed: 0, lastStatus: null },
    resultCheckEpoch: 1,
    diagnostics: []
  };
}

function failedAttempt(): AutomationStudioNodeAttemptTrace {
  return {
    attemptId: "node.action.attempt.1",
    nodeId: "node.action",
    definitionId: "builtin.policy.action",
    startedAt: 1,
    finishedAt: 2,
    status: "failed",
    route: "failed",
    inputs: {},
    outputs: {},
    effects: [],
    message: "The action failed.",
    failure: { category: "target_not_found", code: "test.target_not_found", retryable: false }
  };
}

function runDetail(noFailedAttempt: boolean): AutomationStudioFlowRunDetail {
  return {
    schemaVersion: "0.1",
    summary: {
      schemaVersion: "0.1",
      runId: "run.failed",
      flowId: "flow.recovery",
      projectId: "project.recovery",
      status: "failed",
      updatedAt: 1_000,
      routeDecisionCount: 0,
      subflowEntryCount: 0,
      actionAttemptCount: noFailedAttempt ? 0 : 1,
      interventionCount: 0,
      adaptationCount: 0
    },
    routeDecisions: [],
    subflows: [],
    actionAttempts: noFailedAttempt ? [] : [{ attemptId: "node.action.attempt.1", nodeId: "node.action", definitionId: "builtin.policy.action", order: 1, status: "failed", startedAt: 1, finishedAt: 2 }],
    interventions: [],
    adaptationIds: [],
    changeProposalIds: []
  };
}
