import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type {
  AutomationStudioAdaptationPolicy,
  AutomationStudioFlowDocument,
  AutomationStudioFlowRunDetail
} from "../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../executor.ts";
import type {
  AutomationStudioHarnessOptionBundle,
  AutomationStudioLlmEvidenceRuntimeBinding,
  AutomationStudioLlmProvider,
  AutomationStudioLlmTaskRequest
} from "../../../llm/index.ts";
import type {
  AutomationStudioTrainingModeBehavior,
  AutomationStudioTrainingModeSettings
} from "../../../training-modes.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "../../../service.ts";
import { annotateAutomationStudioRunDetailWithRuntimeLlm } from "../annotate.ts";
import type { AutomationStudioRuntimeRecoveryPorts } from "../ports.ts";

// What the exploration allowance is for.
//
// The bounded exploration was wired into the recovery path and was useless in
// practice, because it drew on `maxCallsPerRun` -- which defaults to two, and
// which the diagnosis and the patch had already spent. A real recovery reached
// stage C, was refused, and recorded `budget_exhausted` before it looked at
// anything at all.
//
// This drives the whole path with two calls of ordinary allowance and nothing
// else changed: a diagnosis, two exploration decisions and a patch, all four
// answered. On the previous code the third call was refused and the fourth
// never happened.
describe("the recovery path's two call allowances", () => {
  it("explores and then patches on a run whose ordinary allowance is exactly the diagnosis and the patch", async () => {
    const taskKinds: string[] = [];
    const executed: string[] = [];
    const detail = await annotate({ taskKinds, executed });

    expect(taskKinds).toEqual(["runtime_diagnosis", "evidence_tool_decision", "evidence_tool_decision", "runtime_patch"]);
    expect(executed).toEqual(["test.inspect"]);
    expect(explorationStage(detail)).toMatchObject({
      stage: "exploration",
      status: "completed",
      detail: { requested: true, outcome: "evidence_gathered", observedActions: 1, providerCalls: 2 }
    });
    // Two ordinary calls and two exploration calls, counted apart and reported
    // apart, so what exploring cost is visible rather than mixed into the pair.
    expect((detail.metadata?.llmGate as JsonObject | undefined)?.costAccounting).toMatchObject({ calls: 2, explorationCalls: 2 });
    expect(budgetCodes(detail)).toEqual([]);
  });

  // The same run with the exploration allowance taken away: the diagnosis and
  // the patch are unaffected, which is the property the split exists for.
  it("leaves the diagnosis and the patch untouched when the exploration allowance is spent", async () => {
    const taskKinds: string[] = [];
    const executed: string[] = [];
    const detail = await annotate({ taskKinds, executed, explorationCallAllowance: 1 });

    expect(taskKinds).toEqual(["runtime_diagnosis", "evidence_tool_decision", "runtime_patch"]);
    expect(executed).toEqual(["test.inspect"]);
    expect(explorationStage(detail)).toMatchObject({
      status: "failed",
      detail: { requested: true, outcome: "budget_exhausted", endedBy: "llm_budget.run_exploration_call_limit" }
    });
    expect((detail.metadata?.llmGate as JsonObject | undefined)?.costAccounting).toMatchObject({ calls: 2, explorationCalls: 1 });
  });
});

type Options = {
  taskKinds: string[];
  executed: string[];
  explorationCallAllowance?: number;
};

async function annotate(options: Options): Promise<AutomationStudioFlowRunDetail> {
  return await annotateAutomationStudioRunDetailWithRuntimeLlm({
    ports: ports(options),
    detail: runDetail(),
    context: context(),
    runtimeFlow: runtimeFlow(),
    failedTraceAttempt: failedAttempt(),
    ...(options.explorationCallAllowance === undefined ? {} : { explorationCallAllowance: options.explorationCallAllowance })
  });
}

function explorationStage(detail: AutomationStudioFlowRunDetail): JsonObject | undefined {
  const trace = detail.metadata?.recoveryTrace as { stages?: JsonObject[] } | undefined;
  return trace?.stages?.find((stage) => stage.stage === "exploration");
}

/** Every budget refusal the gate recorded, so "none" can be asserted directly. */
function budgetCodes(detail: AutomationStudioFlowRunDetail): string[] {
  const gate = detail.metadata?.llmGate as { diagnostics?: { code?: string }[] } | undefined;
  return (gate?.diagnostics ?? []).map((diagnostic) => String(diagnostic.code)).filter((code) => code.startsWith("llm_budget."));
}

function ports(options: Options): AutomationStudioRuntimeRecoveryPorts {
  return {
    // Two calls, which is what a `diagnose_and_adapt` run is granted and what
    // the diagnosis and the patch between them use up.
    resolveLlmProvider: () => ({ provider: provider(options), maxCallsPerRun: 2 }),
    llmEvidenceRuntime: binding(options),
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
 * A stub that reports usage, as a real provider does.
 *
 * That matters here: the ledger charges reported usage rather than the
 * worst-case reservation, so a stub that reports nothing is charged the whole
 * per-request ceiling and hits the token ceiling long before any call limit.
 * Reporting makes the call allowances the binding limit, which is the thing
 * under test.
 */
function provider(options: Options): AutomationStudioLlmProvider {
  const usage = { inputTokens: 1_200, outputTokens: 200, totalTokens: 1_400, estimatedCostUsd: 0.002 };
  return {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async (request: AutomationStudioLlmTaskRequest) => {
      options.taskKinds.push(request.taskKind);
      if (request.expectedOutput === "diagnosis") {
        return {
          response: {
            kind: "diagnosis",
            summary: "The action could not find its control.",
            diagnosis: { explorationNeeded: true, patchNeeded: true }
          },
          usage
        };
      }
      if (request.expectedOutput === "evidence_tool_decision") {
        const offered = (request.context.evidenceLoop?.tools ?? []).map((tool) => tool.toolId);
        const decision = request.context.evidenceLoop?.iteration === 1 && offered.includes("test.inspect")
          ? { kind: "tool_call" as const, callId: "call.1", toolId: "test.inspect", input: {} }
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

function binding(options: Options): AutomationStudioLlmEvidenceRuntimeBinding {
  return {
    domainId: "test.domain",
    deniedEvidenceKeys: [],
    tools: [],
    harnessOptions: harnessOptions(options),
    executeTool: async () => { throw new Error("The bare tool slot is not used by this binding."); }
  };
}

function harnessOptions(options: Options): AutomationStudioHarnessOptionBundle {
  return {
    schemaVersion: "0.1",
    domainId: "test.domain",
    options: [{
      toolId: "test.inspect",
      description: "Look at what is actually there.",
      inputSchema: { type: "object", additionalProperties: false, properties: {} },
      effect: "observe",
      availability: { kind: "domain", domainId: "test.domain" },
      safety: { sideEffect: "observe" },
      stages: ["gather", "iterate"]
    }],
    implementations: {
      "test.inspect": async () => {
        options.executed.push("test.inspect");
        return { kind: "llm_evidence_tool_execution", evidence: { control: "absent" }, effectApplied: false };
      }
    }
  };
}

function context(): AutomationStudioRuntimeAdaptationContext {
  return {
    projectId: "project.recovery",
    flowId: "flow.recovery",
    settings: settings(),
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
    budgetDecision: { ok: true, exhausted: [], behavior: "continue" },
    runsCompleted: 3,
    recentRunCount: 3,
    recentAdaptationCount: 0,
    recentAdaptations: [],
    diagnostics: []
  };
}

/** No `maxTokensPerRun`, so Core's own default sizes the per-run token pot. */
function settings(): AutomationStudioTrainingModeSettings {
  return {
    mode: "continuous_adaptive",
    allowLlmIntervention: true,
    allowRuntimeRecovery: true,
    allowAdaptationCreation: true,
    proposalApprovalMode: "auto",
    allowPromotion: true,
    budgets: { exhaustedBehavior: "stop" }
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
