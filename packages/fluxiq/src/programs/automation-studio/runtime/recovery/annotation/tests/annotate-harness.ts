// The stub world every `annotate.ts` test runs in: eight ports, a provider that
// answers each task kind, a domain binding with one observing option and one
// mutating one, and the run detail they all act on.
//
// It lives beside the tests rather than inside one because the test file grew
// past its line limit and the audit was right about why: the fixtures are not
// the subject, and a second test file for this module would otherwise have to
// copy them. Nothing here ships.

import type { AutomationStudioAdaptiveFailureClass } from "@fluxiq/contracts/automation-studio";
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
import { resolveAutomationStudioResultCheckSchedule } from "../../../result-check-schedule/index.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "../../../service.ts";
import {
  AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_REFUSAL_CODES,
  AutomationStudioLlmExecutionGrantRefusal
} from "../../../llm/index.ts";
import { annotateAutomationStudioRunDetailWithRuntimeLlm } from "../annotate.ts";
import type { AutomationStudioRuntimeRecoveryPorts } from "../ports.ts";

/** A recovery whose provider resolution throws `thrown`, and nothing else unusual. */
export async function annotateUnresolvable(thrown: unknown): Promise<AutomationStudioFlowRunDetail> {
  const base: Options = { executed: [] };
  return await annotateAutomationStudioRunDetailWithRuntimeLlm({
    ports: { ...ports(base), resolveLlmProvider: () => { throw thrown; } },
    detail: runDetail(),
    context: context(base, adaptationPolicy(false)),
    failedTraceAttempt: failedAttempt()
  });
}

/** A failed run the gate refuses: settings with LLM intervention off, or a spent training budget, and no grant. */
export async function annotateRefused(options: { taskKinds: string[]; invokeLlm: boolean; exhausted?: string[] }): Promise<AutomationStudioFlowRunDetail> {
  const base: Options = { executed: [], taskKinds: options.taskKinds };
  const policy = adaptationPolicy(false);
  const exhausted = options.exhausted ?? [];
  return await annotateAutomationStudioRunDetailWithRuntimeLlm({
    ports: ports(base),
    detail: runDetail(),
    context: {
      ...context(base, policy),
      behavior: { ...behavior(), invokeLlm: options.invokeLlm },
      budgetDecision: { ok: exhausted.length === 0, exhausted, behavior: exhausted.length ? "ask" : "continue" }
    },
    failedTraceAttempt: {
      ...failedAttempt(),
      failure: { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" }
    }
  });
}

export const FAILURE_PAGE: JsonObject = { schemaVersion: "test.page.v1", page: "page.failed", controls: ["candidate.2"] };
export const REVEALED_PAGE: JsonObject = { schemaVersion: "test.page.v1", page: "page.revealed", controls: ["candidate.7"] };

type RepairRun = {
  detail: AutomationStudioFlowRunDetail;
  patchRequest?: AutomationStudioLlmTaskRequest;
  asked: Array<{ page: unknown; handles: unknown }>;
  executed: string[];
};

/**
 * One recovery under a `diagnose_and_adapt` grant, whose patch names `handles`,
 * of an action whose target was not found unless `failure` says otherwise.
 */
export async function annotateRepair(options: { handles: Record<string, string>; explorationNeeded?: boolean; failure?: AutomationStudioAdaptiveFailureClass; decline?: string }): Promise<RepairRun> {
  const run: RepairRun = { detail: runDetail(), asked: [], executed: [] };
  const base: Options = { executed: run.executed, captureFailureEvidence: true, ...(options.explorationNeeded === false ? { explorationNeeded: false } : {}) };
  const policy = adaptationPolicy(false);
  const patchingProvider: AutomationStudioLlmProvider = {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async (request) => {
      if (request.expectedOutput !== "runtime_patch") {
        const answered = await provider(base).runTask(request);
        const response = (answered as { response: { kind: string; diagnosis?: JsonObject } }).response;
        return response.kind === "diagnosis" ? { response: { ...response, diagnosis: { ...response.diagnosis, patchNeeded: true } } } : answered;
      }
      run.patchRequest = request;
      if (options.decline) return { response: { kind: "no_repair", summary: "Nothing here replaces it.", reason: options.decline } };
      return {
        response: {
          kind: "runtime_patch",
          summary: "Point the action at the control the exploration found.",
          riskLevel: "medium",
          patches: [{ kind: "temporary_target_override", targetNodeId: "node.action", target: { handles: options.handles }, reason: "The control is behind a disclosure." }]
        }
      };
    }
  };
  const pages: AutomationStudioLlmEvidenceRuntimeBinding = {
    ...binding(base),
    harnessOptions: {
      ...harnessOptions(base),
      implementations: {
        ...harnessOptions(base).implementations,
        "test.inspect": async () => {
          run.executed.push("test.inspect");
          return { kind: "llm_evidence_tool_execution", evidence: REVEALED_PAGE, effectApplied: false };
        }
      }
    },
    captureSanitizedFailureEvidence: async () => FAILURE_PAGE,
    validateTargetOverrideEvidence: (evidence, target) => {
      run.asked.push({ page: evidence.page, handles: target.handles });
      const issued = Array.isArray(evidence.controls) ? evidence.controls : [];
      return Object.values(target.handles).every((handle) => issued.includes(handle))
        ? { status: "resolved", target: { handles: target.handles, page: evidence.page ?? null } }
        : { status: "absent", reason: "handle_not_issued" };
    }
  };
  run.detail = await annotateAutomationStudioRunDetailWithRuntimeLlm({
    ports: {
      ...ports(base),
      resolveLlmProvider: () => ({ provider: patchingProvider, maxCallsPerRun: 6, maxTotalTokensPerRun: 100_000, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 2, tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 } }),
      llmEvidenceRuntime: pages
    },
    detail: runDetail(),
    context: { ...context(base, policy), behavior: { ...behavior(), createAdaptations: true } },
    runtimeFlow: { schemaVersion: "0.1", flowId: "flow.recovery", ownerKind: "policy", ownerId: "project.recovery", name: "Recovery flow", nodes: [{ id: "node.action", definitionId: "builtin.policy.action" }], edges: [], createdAt: 1, updatedAt: 1 },
    failedTraceAttempt: { ...failedAttempt(), failure: { category: options.failure ?? "target_not_found", code: `test.${options.failure ?? "target_not_found"}`, retryable: false } },
    executionGrant: { grantId: "llm-grant:test", actorUserId: "user.test", actorSessionId: "session.test", purpose: "diagnose_and_adapt" }
  });
  return run;
}

type Options = {
  executed: string[];
  /** The call count the resolver declares; `undeclared` leaves it to Core's backstop. */
  maxCallsPerRun?: number | "undeclared";
  /** The policy's and the settings' intervention limit, when one is set. */
  maxInterventionsPerRun?: number;
  /** The tool ids the model was offered, one entry per exploration decision. */
  offered?: string[][];
  scope?: AutomationStudioFlowScope | undefined;
  explorationNeeded?: boolean;
  allowExternalSideEffects?: boolean;
  /** The domain captures a failure snapshot, as the web domain always does. */
  captureFailureEvidence?: boolean;
  /** Every task kind the provider was actually asked for, in order. */
  taskKinds?: string[];
  /** Whether diagnosis requests a patch after exploration. */
  patchNeeded?: boolean;
  /** The policy's runtime-recovery flag, when the test needs it off. */
  allowRuntimeRecovery?: boolean;
  /**
   * What the second, re-planning diagnosis answers, when it differs from the
   * first. The stub tells the two apart by the stage the context names, which
   * also pins that the re-plan is made at `plan` rather than at `gather` again.
   */
  replan?: { patchNeeded?: boolean; stillAchievable?: "yes" | "no" | "unknown" };
  /** Every request the provider was given, in order, for tests about what a call carried. */
  requests?: AutomationStudioLlmTaskRequest[];
  /** The re-planning call answers with something that is not a diagnosis. */
  replanFails?: boolean;
  /** A terminal diagnosis verdict that prevents any patch request. */
  stillAchievable?: "no";
};

export async function annotate(options: Options): Promise<AutomationStudioFlowRunDetail> {
  const policy = {
    ...adaptationPolicy(options.allowExternalSideEffects === true),
    ...(options.maxInterventionsPerRun === undefined ? {} : { maxInterventionsPerRun: options.maxInterventionsPerRun }),
    ...(options.allowRuntimeRecovery === false ? { allowRuntimeRecovery: false } : {})
  };
  return await annotateAutomationStudioRunDetailWithRuntimeLlm({
    ports: ports(options),
    detail: runDetail(),
    context: context(options, policy),
    failedTraceAttempt: failedAttempt()
  });
}

export function explorationStage(detail: AutomationStudioFlowRunDetail): JsonObject | undefined {
  return traceStage(detail, "exploration");
}

export function planStage(detail: AutomationStudioFlowRunDetail): JsonObject | undefined {
  return traceStage(detail, "recovery_plan");
}

function traceStage(detail: AutomationStudioFlowRunDetail, stage: string): JsonObject | undefined {
  const trace = detail.metadata?.recoveryTrace as { stages?: JsonObject[] } | undefined;
  return trace?.stages?.find((event) => event.stage === stage);
}

function ports(options: Options): AutomationStudioRuntimeRecoveryPorts {
  const scope: AutomationStudioFlowScope | undefined = "scope" in options ? options.scope : { kind: "domain", domainId: "test.domain" };
  return {
    resolveLlmProvider: () => options.maxCallsPerRun === "undeclared"
      ? { provider: provider(options) }
      : { provider: provider(options), maxCallsPerRun: options.maxCallsPerRun ?? 4 },
    llmEvidenceRuntime: binding(options),
    reusableLlmContextEnabled: false,
    flowInstructionSet: async () => [],
    reusableLlmContextForFreshEvidence: async () => undefined,
    flowForRecovery: async () => scope ? { scope } : undefined,
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
      options.taskKinds?.push(request.taskKind);
      options.requests?.push(request);
      if (request.expectedOutput === "diagnosis") {
        // The re-plan is the diagnosis made at the `plan` stage. Where the test
        // gave it its own answer, that is what looking at the page changed.
        const replanning = request.context.stage === "plan";
        if (replanning && options.replanFails) return { response: { kind: "no_repair", summary: "The second call answered with something else.", reason: "several_alike" } };
        const answer = replanning && options.replan ? options.replan : { patchNeeded: options.patchNeeded !== false, ...(options.stillAchievable ? { stillAchievable: options.stillAchievable } : {}) };
        return {
          response: {
            kind: "diagnosis",
            summary: replanning ? "Looking at the page settles it." : "The action could not find its control.",
            diagnosis: { explorationNeeded: options.explorationNeeded !== false, patchNeeded: answer.patchNeeded !== false, ...(answer.stillAchievable ? { stillAchievable: answer.stillAchievable } : {}) }
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
    executeTool: async () => { throw new Error("The bare tool slot is not used by this binding."); },
    ...(options.captureFailureEvidence
      ? { captureSanitizedFailureEvidence: async () => ({ schemaVersion: "test.failure-evidence.v1", failedControl: "submit", visible: false }) }
      : {})
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
      // Schema-versioned, because that is what makes the exploration record it
      // as a packet the next call can be shown. Without one the loop looks,
      // learns something, and has nothing to put in front of a re-plan.
      "test.inspect": async () => {
        options.executed.push("test.inspect");
        return { kind: "llm_evidence_tool_execution", evidence: { schemaVersion: "test.page.v1", page: "page.explored", control: "absent" }, effectApplied: false };
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
    resultCheckSchedule: resolveAutomationStudioResultCheckSchedule("initial_then_exponential"),
    resultCheckState: { ordinal: 1, lastCheckedOrdinal: null, checksPassed: 0, lastStatus: null },
    resultCheckEpoch: 1,
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
    budgets: {
      maxTokensPerRun: 200_000,
      exhaustedBehavior: "stop",
      ...(options.maxInterventionsPerRun === undefined ? {} : { maxInterventionsPerRun: options.maxInterventionsPerRun })
    }
  };
}

export function adaptationPolicy(allowExternalSideEffects: boolean): AutomationStudioAdaptationPolicy {
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
