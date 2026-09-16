import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type {
  AutomationStudioAdaptationPolicy,
  AutomationStudioFlowRunDetail,
  AutomationStudioFlowScope
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

// The wiring Phase 2.3 left undone. The runner, the budget, the outcomes and the
// recovery clock all existed and passed their own tests; nothing called any of
// it, so a plan could say `explorationRequested` and the run went straight from
// the diagnosis to the patch with the `exploration` stage permanently `skipped`.
//
// These drive the whole recovery path with eight stub ports. The first one fails
// if the call into `runAutomationStudioRecoveryExploration` is removed, and the
// second fails if the result is not passed into the trace.
describe("annotateAutomationStudioRunDetailWithRuntimeLlm", () => {
  it("runs a bounded exploration when the plan asks for one, and takes an action to do it", async () => {
    const executed: string[] = [];
    const detail = await annotate({ executed });

    expect(executed).toEqual(["test.inspect"]);
    expect(explorationStage(detail)).toMatchObject({
      stage: "exploration",
      status: "completed",
      providerCalled: true,
      loopStage: "gather",
      detail: { requested: true, outcome: "evidence_gathered", observedActions: 1, providerCalls: 2 }
    });
  });

  it("says the plan asked for an exploration and none ran when the Flow has no scope", async () => {
    const executed: string[] = [];
    const detail = await annotate({ executed, scope: undefined });

    expect(executed).toEqual([]);
    expect(explorationStage(detail)).toMatchObject({
      stage: "exploration",
      status: "skipped",
      providerCalled: false,
      reason: "The plan asked for exploration and none was run.",
      detail: { requested: true }
    });
  });

  // The policy governs the call, so it decides the side effects, and the
  // recovery path passes no `allowSideEffectsWithoutPolicy` that could reach
  // past it. The mutating option is simply not in the grammar the model is given.
  it("withholds a mutating option from the exploration while the policy forbids side effects", async () => {
    const executed: string[] = [];
    const offered: string[][] = [];
    await annotate({ executed, offered });

    expect(offered[0]).toEqual(["test.inspect"]);
    expect(executed).toEqual(["test.inspect"]);
  });

  it("offers the same mutating option once the policy allows external side effects", async () => {
    const executed: string[] = [];
    const offered: string[][] = [];
    await annotate({ executed, offered, allowExternalSideEffects: true });

    expect(offered[0]).toEqual(["test.inspect", "test.reveal"]);
  });

  // The exploration is billed to the run's own LLM budget, beside the diagnosis
  // and the patch, but to its own call allowance. A budget that cannot pay for
  // the next decision is a limit being reached, not the loop breaking, and the
  // two are different advice. One call's allowance buys the look and not the
  // answer, so the exploration takes its action and then stops.
  it("ends the exploration in budget exhaustion when its own call allowance runs out", async () => {
    const executed: string[] = [];
    const detail = await annotate({ executed, explorationCallAllowance: 1 });

    expect(executed).toEqual(["test.inspect"]);
    expect(explorationStage(detail)).toMatchObject({
      status: "failed",
      detail: { requested: true, outcome: "budget_exhausted", endedBy: "llm_budget.run_exploration_call_limit" }
    });
  });

  // The other direction, and the one that makes the split worth having: the
  // ordinary call limit is spent on the diagnosis alone, and the exploration
  // still runs because it never drew on that limit in the first place.
  it("still explores when the ordinary call limit is spent on the diagnosis", async () => {
    const executed: string[] = [];
    const detail = await annotate({ executed, maxCallsPerRun: 1 });

    expect(executed).toEqual(["test.inspect"]);
    expect(explorationStage(detail)).toMatchObject({
      status: "completed",
      detail: { requested: true, outcome: "evidence_gathered", observedActions: 1 }
    });
  });

  it("does not explore when the plan did not ask for one", async () => {
    const executed: string[] = [];
    const detail = await annotate({ executed, explorationNeeded: false });

    expect(executed).toEqual([]);
    expect(explorationStage(detail)).toMatchObject({
      status: "skipped",
      reason: "The plan did not call for exploration.",
      detail: { requested: false }
    });
  });
});

type Options = {
  executed: string[];
  /** How many provider calls the run may make for its diagnosis and patch. */
  maxCallsPerRun?: number;
  /** How many provider calls the exploration may make, on its own allowance. */
  explorationCallAllowance?: number;
  /** The tool ids the model was offered, one entry per exploration decision. */
  offered?: string[][];
  scope?: AutomationStudioFlowScope | undefined;
  explorationNeeded?: boolean;
  allowExternalSideEffects?: boolean;
};

async function annotate(options: Options): Promise<AutomationStudioFlowRunDetail> {
  const policy = adaptationPolicy(options.allowExternalSideEffects === true);
  return await annotateAutomationStudioRunDetailWithRuntimeLlm({
    ports: ports(options),
    detail: runDetail(),
    context: context(options, policy),
    failedTraceAttempt: failedAttempt(),
    ...(options.explorationCallAllowance === undefined ? {} : { explorationCallAllowance: options.explorationCallAllowance })
  });
}

function explorationStage(detail: AutomationStudioFlowRunDetail): JsonObject | undefined {
  const trace = detail.metadata?.recoveryTrace as { stages?: JsonObject[] } | undefined;
  return trace?.stages?.find((stage) => stage.stage === "exploration");
}

function ports(options: Options): AutomationStudioRuntimeRecoveryPorts {
  const scope: AutomationStudioFlowScope | undefined = "scope" in options ? options.scope : { kind: "domain", domainId: "test.domain" };
  return {
    resolveLlmProvider: () => ({ provider: provider(options), maxCallsPerRun: options.maxCallsPerRun ?? 4 }),
    llmEvidenceRuntime: binding(options),
    reusableLlmContextEnabled: false,
    flowInstructionSet: async () => [],
    reusableLlmContextForFreshEvidence: async () => undefined,
    flowScope: async () => scope,
    saveFlowChangeProposal: async (proposal) => proposal,
    saveFlowAdaptation: async (adaptation) => adaptation,
    promoteRuntimeAdaptation: async (input) => input.adaptation
  };
}

/** Answers the diagnosis, then the one exploration decision, and nothing else. */
function provider(options: Options): AutomationStudioLlmProvider {
  return {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async (request: AutomationStudioLlmTaskRequest) => {
      if (request.expectedOutput === "diagnosis") {
        return {
          response: {
            kind: "diagnosis",
            summary: "The action could not find its control.",
            diagnosis: { explorationNeeded: options.explorationNeeded !== false, patchNeeded: false }
          }
        };
      }
      if (request.expectedOutput === "evidence_tool_decision") {
        const offered = (request.context.evidenceLoop?.tools ?? []).map((tool) => tool.toolId);
        options.offered?.push(offered);
        // Look once, then answer. The second decision is the one that completes.
        const decision = request.context.evidenceLoop?.iteration === 1 && offered.includes("test.inspect")
          ? { kind: "tool_call" as const, callId: "call.1", toolId: "test.inspect", input: {} }
          : { kind: "complete" as const, result: { findings: "The control moved." } };
        return { response: { kind: "evidence_tool_decision", summary: "Looking at the control.", decision } };
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

/** One observing option and one mutating one, so the policy gate has something to decide. */
function harnessOptions(options: Options): AutomationStudioHarnessOptionBundle {
  return {
    schemaVersion: "0.1",
    domainId: "test.domain",
    options: [
      {
        toolId: "test.inspect",
        description: "Look at what is actually there.",
        inputSchema: { type: "object", additionalProperties: false, properties: {} },
        effect: "observe",
        availability: { kind: "domain", domainId: "test.domain" },
        safety: { sideEffect: "observe" },
        stages: ["gather", "iterate"]
      },
      {
        toolId: "test.reveal",
        description: "Change what is shown so the rest can be seen.",
        inputSchema: { type: "object", additionalProperties: false, properties: {} },
        effect: "mutate",
        availability: { kind: "domain", domainId: "test.domain" },
        safety: { sideEffect: "mutate" },
        stages: ["gather", "iterate"]
      }
    ],
    implementations: {
      "test.inspect": async () => {
        options.executed.push("test.inspect");
        return { kind: "llm_evidence_tool_execution", evidence: { control: "absent" }, effectApplied: false };
      },
      "test.reveal": async () => {
        options.executed.push("test.reveal");
        return { kind: "llm_evidence_tool_execution", evidence: { revealed: true }, effectApplied: true };
      }
    }
  };
}

function context(options: Options, policy: AutomationStudioAdaptationPolicy): AutomationStudioRuntimeAdaptationContext {
  return {
    projectId: "project.recovery",
    flowId: "flow.recovery",
    settings: settings(options),
    policy,
    behavior: behavior(),
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

/** `createAdaptations` is off so the patch call never fires: these are about stage C. */
function behavior(): AutomationStudioTrainingModeBehavior {
  return { invokeLlm: true, runRecovery: true, createAdaptations: false, proposalApprovalMode: "auto", promoteAdaptations: false };
}

function settings(options: Options): AutomationStudioTrainingModeSettings {
  return {
    mode: "continuous_adaptive",
    allowLlmIntervention: true,
    allowRuntimeRecovery: true,
    allowAdaptationCreation: true,
    proposalApprovalMode: "auto",
    allowPromotion: true,
    budgets: { maxTokensPerRun: 200_000, exhaustedBehavior: "stop" }
  };
}

function adaptationPolicy(allowExternalSideEffects: boolean): AutomationStudioAdaptationPolicy {
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
    allowExternalSideEffects,
    requireApprovalForDestructiveChanges: true,
    requireApprovalForExternalSideEffects: false,
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
