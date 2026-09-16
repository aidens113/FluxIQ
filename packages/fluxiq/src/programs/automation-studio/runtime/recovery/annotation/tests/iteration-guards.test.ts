import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type {
  AutomationStudioAdaptationPolicy,
  AutomationStudioFlowDocument,
  AutomationStudioFlowRunDetail
} from "../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../executor.ts";
import {
  AutomationStudioLlmProviderError,
  type AutomationStudioHarnessOptionBundle,
  type AutomationStudioLlmEvidenceRuntimeBinding,
  type AutomationStudioLlmProvider,
  type AutomationStudioLlmTaskRequest
} from "../../../llm/index.ts";
import type { AutomationStudioTrainingModeSettings } from "../../../training-modes.ts";
import type { AutomationStudioLlmProviderResolution, AutomationStudioRuntimeAdaptationContext } from "../../../service.ts";
import { annotateAutomationStudioRunDetailWithRuntimeLlm } from "../annotate.ts";
import type { AutomationStudioRuntimeRecoveryPorts } from "../ports.ts";

// What bounds a recovery, driven through the whole recovery path.
//
// A recovery used to be bounded by a small call count: two for the diagnosis
// and the patch, with an exploration allowance of four bolted on beside them.
// A real recovery spent the two, and anything that needed a longer look at the
// live environment was cut off -- "this hard limit is causing a lot of
// problems". The decision was that an adaptation iterates for as many provider
// calls as it needs, bounded within reason, and "within reason" is four guards:
// the run's cost ceiling, its token budget, the recovery's clock, and whether
// the loop is still getting anywhere.
//
// Each case below drives a diagnosis, an exploration and a patch with a stub
// provider that reports usage the way a real one does, and no call count
// declared anywhere unless the case says so.
describe("what bounds a recovery", () => {
  it("lets a recovery that keeps learning iterate well past the old two- and six-call limits", async () => {
    const run = await annotate({ looks: 12 });

    expect(run.taskKinds).toEqual(["runtime_diagnosis", ...Array.from({ length: 13 }, () => "evidence_tool_decision"), "runtime_patch"]);
    expect(run.executed).toHaveLength(12);
    expect(explorationStage(run.detail)).toMatchObject({
      status: "completed",
      detail: { requested: true, outcome: "evidence_gathered", observedActions: 12, providerCalls: 13 }
    });
    // Every call is on one receipt, and what exploring cost is still visible.
    expect(costAccounting(run.detail)).toMatchObject({ calls: 15, explorationCalls: 13 });
    expect(budgetCodes(run.detail)).toEqual([]);
  });

  // The guard that makes the one above safe. The model keeps asking new
  // questions and keeps getting the answer it already has; nothing is spent
  // out and nothing is counted out, and the exploration still stops -- after
  // four looks of its twenty-four -- saying it was going in circles. The
  // patch stage still runs: a circling exploration is a finding, not a fault.
  it("stops an exploration that is going in circles on the no-progress guard, then still patches", async () => {
    const run = await annotate({ looks: 40, sameAnswer: true });

    expect(run.executed).toHaveLength(4);
    expect(run.taskKinds).toEqual(["runtime_diagnosis", "evidence_tool_decision", "evidence_tool_decision", "evidence_tool_decision", "evidence_tool_decision", "runtime_patch"]);
    expect(explorationStage(run.detail)).toMatchObject({
      status: "failed",
      detail: { requested: true, outcome: "no_progress", endedBy: "no_progress", stopReason: "no_progress", noProgressReason: "repeated_evidence", actions: 4 }
    });
    expect(budgetCodes(run.detail)).toEqual([]);
  });

  // The guard also ends a loop whose answers are unusable. Every decision call
  // fails as the provider's own invalid output -- a spent call, not a fault --
  // so the exploration asks again, and after three unusable answers of its
  // twenty-four allowed it is stopped, saying the answers were the problem. The
  // patch still runs: nothing about a bad reply ends the recovery.
  it("stops an exploration whose every decision comes back unusable on the no-progress guard, then still patches", async () => {
    const run = await annotate({ looks: 40, unusableDecisions: "all" });

    expect(run.taskKinds).toEqual(["runtime_diagnosis", "evidence_tool_decision", "evidence_tool_decision", "evidence_tool_decision", "runtime_patch"]);
    expect(run.executed).toEqual([]);
    expect(explorationStage(run.detail)).toMatchObject({
      status: "failed",
      detail: { requested: true, outcome: "no_progress", endedBy: "no_progress", stopReason: "no_progress", noProgressReason: "unusable_decision", unusableDecisions: 3, actions: 0 }
    });
    // Each unusable answer is on the receipt, charged, with its code.
    expect(costAccounting(run.detail)).toMatchObject({ calls: 5, explorationCalls: 3, pendingCalls: 0 });
    expect(receipt(run.detail).filter((call) => call.taskKind === "evidence_tool_decision").map((call) => call.validation)).toEqual(
      Array.from({ length: 3 }, () => ({ ok: false, issueCodes: ["llm.provider_output_invalid"] }))
    );
    expect(patchIntervention(run.detail)).toMatchObject({ kind: "runtime_patch", validation: { ok: true } });
    expect(budgetCodes(run.detail)).toEqual([]);
  });

  // One answer that fails Core's own checks is a step that did not advance,
  // not the end of the exploration: it is asked again and the loop finishes.
  it("keeps exploring past a single decision that came back unusable", async () => {
    const run = await annotate({ looks: 3, unusableDecisions: [2] });

    expect(run.taskKinds).toEqual(["runtime_diagnosis", ...Array.from({ length: 5 }, () => "evidence_tool_decision"), "runtime_patch"]);
    expect(run.executed).toEqual(["area.1", "area.2", "area.3"]);
    expect(explorationStage(run.detail)).toMatchObject({
      status: "completed",
      detail: { requested: true, outcome: "evidence_gathered", observedActions: 3, unusableDecisions: 1 }
    });
    expect(receipt(run.detail).filter((call) => call.taskKind === "evidence_tool_decision")[1]).toMatchObject({
      validation: { ok: false, issueCodes: ["llm_output.kind_mismatch"] }
    });
    expect(patchIntervention(run.detail)).toMatchObject({ validation: { ok: true } });
  });

  // Money still ends an exploration, on its own code, and the patch keeps its
  // share. Each call reserves a twenty-fourth of the $0.25 purse and spends 98%
  // of what it reserved. With the patch's share held back, the exploration is
  // refused at its twenty-third decision rather than its twenty-fourth, and the
  // patch then fits in what was held for it -- where before the exploration
  // spent the purse and the patch was refused, so the recovery proposed nothing.
  it("stops an exploration at the cost ceiling, says it was the money, and still pays for the patch", async () => {
    const run = await annotate({ looks: 40, spendMostOfReservation: true });

    expect(explorationStage(run.detail)).toMatchObject({
      status: "failed",
      detail: { requested: true, outcome: "budget_exhausted", endedBy: "llm_budget.run_cost_limit" }
    });
    const spent = costAccounting(run.detail);
    expect(spent).toMatchObject({ calls: 24, explorationCalls: 22, pendingCalls: 0 });
    expect(Number(spent?.estimatedCostUsd)).toBeLessThanOrEqual(0.25);
    expect(run.executed).toHaveLength(22);
    expect(run.taskKinds.at(-1)).toBe("runtime_patch");
    expect(patchIntervention(run.detail)).toMatchObject({ validation: { ok: true } });
    expect(budgetCodes(run.detail)).toEqual([]);
  });

  // Tokens still end an exploration, on their own code, and the patch keeps
  // its share. A 30,000-token pot, 1,400 used per call, a 10,000-token
  // reservation for the call in flight and 10,000 held for the patch admits
  // seven exploration decisions and refuses the eighth; the patch then runs.
  it("stops an exploration at its token budget, says it was the tokens, and still leaves the patch its tokens", async () => {
    const run = await annotate({ looks: 40, maxTokensPerRun: 30_000 });

    expect(explorationStage(run.detail)).toMatchObject({
      status: "failed",
      detail: { requested: true, outcome: "budget_exhausted", endedBy: "llm_budget.run_total_limit" }
    });
    expect(costAccounting(run.detail)).toMatchObject({ calls: 9, explorationCalls: 7 });
    expect(run.executed).toHaveLength(7);
    expect(run.taskKinds.at(-1)).toBe("runtime_patch");
    expect(budgetCodes(run.detail)).toEqual([]);
  });

  // The patch's call is held back from a declared call count. Six calls, and a
  // model that would keep looking for forty: without the hold the exploration
  // takes calls two to six and the patch is refused, so a recovery that found
  // what was wrong proposes nothing. With it, the exploration stops on its own
  // named call limit after four decisions and the sixth call is the patch.
  it("leaves the patch its call when an exploration would otherwise use every declared call", async () => {
    const run = await annotate({ looks: 40, maxCallsPerRun: 6 });

    expect(run.taskKinds).toEqual(["runtime_diagnosis", "evidence_tool_decision", "evidence_tool_decision", "evidence_tool_decision", "evidence_tool_decision", "runtime_patch"]);
    expect(explorationStage(run.detail)).toMatchObject({
      status: "failed",
      detail: { requested: true, outcome: "budget_exhausted", endedBy: "provider_call_limit" }
    });
    // The trace's `providerCalls` counts loop iterations, including the fifth
    // that the exploration refused before any provider was asked; the receipt
    // and the task list above are what the provider actually answered.
    expect(costAccounting(run.detail)).toMatchObject({ calls: 6, explorationCalls: 4, pendingCalls: 0 });
    expect(budgetCodes(run.detail)).toEqual([]);
    // The patch ran, answered, and its repair went on to be applied or proposed.
    expect(patchIntervention(run.detail)).toMatchObject({ kind: "runtime_patch", validation: { ok: true } });
    expect((run.detail.metadata?.llmGate as JsonObject | undefined)?.ok).toBe(true);
    expect(run.detail.metadata?.runtimePatchAttempts).toBeDefined();
  });

  // A person who authorized an exploring recovery said what it may spend. The
  // run is held to that grant -- twenty-six calls, 100,000 tokens, $2.00 --
  // rather than to the $0.25 the training settings allow a run nobody
  // authorized, and the training budget being spent does not stop it.
  it("holds an explore_and_adapt recovery to its grant, not to the no-grant training budget", async () => {
    const requests: AutomationStudioLlmTaskRequest[] = [];
    const run = await annotate({
      looks: 40,
      spendMostOfReservation: true,
      trainingBudgetExhausted: true,
      requests,
      grant: {
        purpose: "explore_and_adapt",
        resolution: { maxCallsPerRun: 26, maxTotalTokensPerRun: 100_000, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 2, tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 } }
      }
    });

    expect(run.taskKinds[0]).toBe("runtime_diagnosis");
    expect(run.taskKinds.at(-1)).toBe("runtime_patch");
    const spent = costAccounting(run.detail);
    expect(spent).toMatchObject({ calls: 26, explorationCalls: 24, pendingCalls: 0 });
    // Far past the $0.25 an ungranted run may spend, and inside the grant.
    expect(Number(spent?.estimatedCostUsd)).toBeGreaterThan(0.25);
    expect(Number(spent?.estimatedCostUsd)).toBeLessThanOrEqual(2);
    // Every call reserved its share of the grant's purse, not of $0.25.
    for (const request of requests) expect(request.maxEstimatedCostUsd).toBeCloseTo(2 / 26, 8);
    // The diagnosis and the patch say which grant they run under.
    expect(requests.filter((request) => request.taskKind !== "evidence_tool_decision").map((request) => request.metadata?.executionPurpose)).toEqual(["explore_and_adapt", "explore_and_adapt"]);
    expect(budgetCodes(run.detail)).toEqual([]);
  });
});

type Options = {
  /** How many looks the model asks for before it completes. */
  looks: number;
  /** Every look returns the same answer, so none of them after the first is new. */
  sameAnswer?: boolean;
  /** Each call reports spending 98% of the cost it reserved. */
  spendMostOfReservation?: boolean;
  maxTokensPerRun?: number;
  /** A call count the resolver declares, as a grant does. */
  maxCallsPerRun?: number;
  /** An explicit grant, and what its resolver says the run may spend. */
  grant?: { purpose: "diagnose_and_adapt" | "explore_and_adapt"; resolution: Omit<AutomationStudioLlmProviderResolution, "provider"> };
  /** The training settings say the no-grant budget is already spent. */
  trainingBudgetExhausted?: boolean;
  /** Every request the provider was sent, in order. */
  requests?: AutomationStudioLlmTaskRequest[];
  /**
   * Decision calls, counting from one, whose answer cannot be used: `"all"` fails
   * every one as the provider's invalid output, and a list answers those with
   * the wrong kind of response.
   */
  unusableDecisions?: "all" | number[];
};

type Run = { detail: AutomationStudioFlowRunDetail; taskKinds: string[]; executed: string[] };

async function annotate(options: Options): Promise<Run> {
  const taskKinds: string[] = [];
  const executed: string[] = [];
  const detail = await annotateAutomationStudioRunDetailWithRuntimeLlm({
    ports: ports(options, taskKinds, executed),
    detail: runDetail(),
    context: context(options),
    runtimeFlow: runtimeFlow(),
    failedTraceAttempt: failedAttempt(),
    ...(options.grant ? { executionGrant: { grantId: "llm-grant:test", actorUserId: "user.test", actorSessionId: "session.test", purpose: options.grant.purpose } } : {})
  });
  return { detail, taskKinds, executed };
}

/** The patch call's intervention, when the patch was asked for at all. */
function patchIntervention(detail: AutomationStudioFlowRunDetail): AutomationStudioFlowRunDetail["interventions"][number] | undefined {
  return detail.interventions.find((intervention) => intervention.kind === "runtime_patch");
}

function explorationStage(detail: AutomationStudioFlowRunDetail): JsonObject | undefined {
  const trace = detail.metadata?.recoveryTrace as { stages?: JsonObject[] } | undefined;
  return trace?.stages?.find((stage) => stage.stage === "exploration");
}

/** The run's receipt: one line per provider call. */
function receipt(detail: AutomationStudioFlowRunDetail): JsonObject[] {
  return (detail.metadata?.llmGate as { providerCalls?: JsonObject[] } | undefined)?.providerCalls ?? [];
}

function costAccounting(detail: AutomationStudioFlowRunDetail): JsonObject | undefined {
  return (detail.metadata?.llmGate as { costAccounting?: JsonObject } | undefined)?.costAccounting;
}

/** Every budget refusal the gate recorded, so "none" can be asserted directly. */
function budgetCodes(detail: AutomationStudioFlowRunDetail): string[] {
  const gate = detail.metadata?.llmGate as { diagnostics?: { code?: string }[] } | undefined;
  return (gate?.diagnostics ?? []).map((diagnostic) => String(diagnostic.code)).filter((code) => code.startsWith("llm_budget."));
}

function ports(options: Options, taskKinds: string[], executed: string[]): AutomationStudioRuntimeRecoveryPorts {
  return {
    // No call count declared unless a case says so: Core's backstop applies,
    // and the guards bound the run.
    resolveLlmProvider: () => ({
      provider: provider(options, taskKinds),
      ...(options.maxCallsPerRun === undefined ? {} : { maxCallsPerRun: options.maxCallsPerRun }),
      ...(options.grant?.resolution ?? {})
    }),
    llmEvidenceRuntime: binding(options, executed),
    reusableLlmContextEnabled: false,
    flowInstructionSet: async () => [],
    reusableLlmContextForFreshEvidence: async () => undefined,
    flowScope: async () => ({ kind: "domain", domainId: "test.domain" }),
    saveFlowChangeProposal: async (proposal) => proposal,
    saveFlowAdaptation: async (adaptation) => adaptation,
    promoteRuntimeAdaptation: async (input) => input.adaptation
  };
}

/**
 * A stub that reports usage, as a real provider does. The ledger charges what a
 * call reports rather than what it reserved, so this is what lets the run's
 * guards bind on real spending rather than on worst cases.
 */
function provider(options: Options, taskKinds: string[]): AutomationStudioLlmProvider {
  let decisionCalls = 0;
  return {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async (request: AutomationStudioLlmTaskRequest) => {
      taskKinds.push(request.taskKind);
      options.requests?.push(request);
      if (request.expectedOutput === "evidence_tool_decision") {
        decisionCalls += 1;
        if (options.unusableDecisions === "all") {
          throw new AutomationStudioLlmProviderError("llm.provider_output_invalid", "The reply did not satisfy the requested structure.");
        }
        if (options.unusableDecisions?.includes(decisionCalls)) {
          return { response: { kind: "diagnosis", summary: "Not a decision." }, usage: { inputTokens: 1_200, outputTokens: 200, totalTokens: 1_400, estimatedCostUsd: 0.002 } };
        }
      }
      const usage = {
        inputTokens: 1_200,
        outputTokens: 200,
        totalTokens: 1_400,
        estimatedCostUsd: options.spendMostOfReservation ? request.maxEstimatedCostUsd * 0.98 : 0.002
      };
      if (request.expectedOutput === "diagnosis") {
        return {
          response: { kind: "diagnosis", summary: "The action could not find its control.", diagnosis: { explorationNeeded: true, patchNeeded: true } },
          usage
        };
      }
      if (request.expectedOutput === "evidence_tool_decision") {
        const iteration = request.context.evidenceLoop?.iteration ?? 0;
        const decision = iteration <= options.looks
          ? { kind: "tool_call" as const, callId: `call.${iteration}`, toolId: "test.inspect", input: { area: `area.${iteration}` } }
          : { kind: "complete" as const, result: { findings: "The control moved." } };
        return { response: { kind: "evidence_tool_decision", summary: "Looking at the control.", decision }, usage };
      }
      if (request.expectedOutput === "runtime_patch") {
        return {
          response: {
            kind: "runtime_patch",
            summary: "Give the action longer and try again.",
            riskLevel: "low",
            patches: [{ kind: "temporary_wait_retry", targetNodeId: "node.action", timeoutMs: 5_000, retryCount: 1, reason: "The control appears late." }]
          },
          usage
        };
      }
      throw new Error(`The stub provider was asked for ${request.expectedOutput}.`);
    }
  };
}

function binding(options: Options, executed: string[]): AutomationStudioLlmEvidenceRuntimeBinding {
  return {
    domainId: "test.domain",
    deniedEvidenceKeys: [],
    tools: [],
    harnessOptions: harnessOptions(options, executed),
    executeTool: async () => { throw new Error("The bare tool slot is not used by this binding."); }
  };
}

function harnessOptions(options: Options, executed: string[]): AutomationStudioHarnessOptionBundle {
  return {
    schemaVersion: "0.1",
    domainId: "test.domain",
    options: [{
      toolId: "test.inspect",
      description: "Look at one area of what is actually there.",
      inputSchema: { type: "object", additionalProperties: false, required: ["area"], properties: { area: { type: "string", maxLength: 40 } } },
      effect: "observe",
      availability: { kind: "domain", domainId: "test.domain" },
      safety: { sideEffect: "observe" },
      stages: ["gather", "iterate"]
    }],
    implementations: {
      "test.inspect": async (input) => {
        executed.push(String(input.value.area));
        const evidence = options.sameAnswer ? { control: "absent" } : { area: input.value.area ?? null, control: "moved" };
        return { kind: "llm_evidence_tool_execution", evidence, effectApplied: false };
      }
    }
  };
}

function context(options: Options): AutomationStudioRuntimeAdaptationContext {
  return {
    projectId: "project.recovery",
    flowId: "flow.recovery",
    settings: settings(options),
    policy: adaptationPolicy(),
    behavior: { invokeLlm: true, runRecovery: true, createAdaptations: true, proposalApprovalMode: "auto", promoteAdaptations: false },
    metrics: {
      deterministicSuccessRuns: 0,
      llmInterventionsPerRun: 0,
      unresolvedFailures: 1,
      repeatedTriggers: [],
      acceptedAdaptations: 0,
      rejectedAdaptations: 0,
      stabilityScore: 0.5
    },
    budgetState: { interventionsThisRun: 0, tokensThisRun: 0, costUsdThisTrainingWindow: 0 },
    budgetDecision: options.trainingBudgetExhausted
      ? { ok: false, exhausted: ["maxEstimatedCostUsdPerTrainingWindow"], behavior: "stop" }
      : { ok: true, exhausted: [], behavior: "continue" },
    runsCompleted: 3,
    recentRunCount: 3,
    recentAdaptationCount: 0,
    recentAdaptations: [],
    diagnostics: []
  };
}

/** No `maxTokensPerRun` unless a case sets one, so Core's own default sizes the pot. */
function settings(options: Options): AutomationStudioTrainingModeSettings {
  return {
    mode: "continuous_adaptive",
    allowLlmIntervention: true,
    allowRuntimeRecovery: true,
    allowAdaptationCreation: true,
    proposalApprovalMode: "auto",
    allowPromotion: true,
    budgets: {
      exhaustedBehavior: "stop",
      ...(options.maxTokensPerRun === undefined ? {} : { maxTokensPerRun: options.maxTokensPerRun })
    }
  };
}

function adaptationPolicy(): AutomationStudioAdaptationPolicy {
  return {
    schemaVersion: "0.1",
    policyId: "policy.recovery",
    scope: { kind: "flow", flowId: "flow.recovery" },
    preset: "adaptive",
    proposalMode: "auto",
    allowRuntimeRecovery: true,
    allowCreateRecoveryPaths: true,
    allowModifySubflows: true,
    allowCreateSubflows: true,
    allowModifyRouter: true,
    allowModifyExpectations: true,
    allowModifyActionTargets: true,
    allowDeleteOrDisableBehavior: false,
    allowExternalSideEffects: false,
    requireApprovalForDestructiveChanges: true,
    requireApprovalForExternalSideEffects: false,
    createdAt: 1,
    updatedAt: 1
  };
}

function runtimeFlow(): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1",
    flowId: "flow.recovery",
    ownerKind: "policy",
    ownerId: "project.recovery",
    name: "Recovery flow",
    nodes: [],
    edges: [],
    createdAt: 1,
    updatedAt: 1
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
    message: "The action failed."
  };
}

function runDetail(): AutomationStudioFlowRunDetail {
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
      actionAttemptCount: 1,
      interventionCount: 0,
      adaptationCount: 0
    },
    routeDecisions: [],
    subflows: [],
    actionAttempts: [{
      attemptId: "node.action.attempt.1",
      nodeId: "node.action",
      definitionId: "builtin.policy.action",
      order: 1,
      status: "failed",
      startedAt: 1,
      finishedAt: 2
    }],
    interventions: [],
    adaptationIds: [],
    changeProposalIds: []
  };
}
