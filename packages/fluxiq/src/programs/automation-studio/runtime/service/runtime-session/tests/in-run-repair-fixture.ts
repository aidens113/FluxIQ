// A provider-free world for the in-run repair (state-aware recovery plan, C6
// step 8): a scripted model that answers the recovery's diagnosis with a
// diagnosis that asks for a patch, closes any look at the page at once, and
// answers each runtime-patch request with the next scripted answer; the ports a
// run session binds, an adapting context, a small Subflow graph, and the
// request the executor makes at a true failure.
//
// It is shared on purpose. The supplier's own tests use it, and so can the
// end-to-end proof that runs the executor's hold-in-place against this session
// side: bind it with `bindAutomationStudioInRunRepair`, hand the graph options
// to the executor, and read what the model was asked from `world.requests`.
// Nothing here ships.

import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowAdaptation, AutomationStudioFlowChangeProposal, AutomationStudioFlowDocument } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import type { AutomationStudioIncidentRepairRequest, AutomationStudioRepairUnit } from "../../../executor/lifecycle-run/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest, AutomationStudioRuntimePatch } from "../../../llm/index.ts";
import type { AutomationStudioRuntimeRecoveryPorts } from "../../../recovery/index.ts";
import { resolveAutomationStudioResultCheckSchedule } from "../../../result-check-schedule/index.ts";
import type { AutomationStudioTrainingModeBehavior } from "../../../training-modes.ts";
import { promoteAutomationStudioRuntimeAdaptation, type AutomationStudioRuntimeAdaptationContext } from "../../runtime-adaptation/index.ts";

export const IN_RUN_REPAIR_RUN_ID = "run.in-run-repair";
export const IN_RUN_REPAIR_PROJECT_ID = "project.in-run-repair";
export const IN_RUN_REPAIR_FLOW_ID = "flow.in-run-repair";
export const IN_RUN_REPAIR_SUBFLOW_ID = "subflow.main";

/** One scripted answer to a runtime-patch request: patches, a refusal, or a call the provider fails. */
export type InRunRepairScript =
  | { patches: AutomationStudioRuntimePatch[]; costUsd?: number }
  | { decline: true }
  | { fail: true };

export type InRunRepairWorld = {
  ports: AutomationStudioRuntimeRecoveryPorts;
  context: AutomationStudioRuntimeAdaptationContext;
  graphOptions: AutomationStudioGraphExecutionOptions;
  /** Every request the model was given, in order. */
  requests: AutomationStudioLlmTaskRequest[];
  adaptations: Map<string, AutomationStudioFlowAdaptation>;
  proposals: AutomationStudioFlowChangeProposal[];
};

/** The answer a scripted model gives when a test names none: a handler for the notice that covers the list. */
export function inRunRepairHandlerPatch(overrides: Partial<Extract<AutomationStudioRuntimePatch, { kind: "add_handler" }>> = {}): AutomationStudioRuntimePatch {
  return {
    kind: "add_handler",
    reason: "A notice covers the list; dismiss it and take the step again.",
    event: "retry",
    scope: { kind: "nodes", nodeIds: ["read"] },
    when: [{ fact: "dialog.visible", op: "visible" }],
    completionCheck: [{ fact: "dialog.visible", op: "absent" }],
    steps: [{ definitionId: "builtin.data.constant", parameters: { value: "dismiss" } }],
    then: { kind: "resume" },
    consequences: [],
    ...overrides
  };
}

/** The world, with the model answering `scripts` in order and the context adapting unless `behavior` says otherwise. */
export function inRunRepairWorld(options: { scripts?: InRunRepairScript[]; behavior?: Partial<AutomationStudioTrainingModeBehavior>; policy?: Partial<AutomationStudioAdaptationPolicy> } = {}): InRunRepairWorld {
  const requests: AutomationStudioLlmTaskRequest[] = [];
  const adaptations = new Map<string, AutomationStudioFlowAdaptation>();
  const proposals: AutomationStudioFlowChangeProposal[] = [];
  const scripts = [...(options.scripts ?? [{ patches: [inRunRepairHandlerPatch()] }])];
  const provider: AutomationStudioLlmProvider = {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async (request) => {
      requests.push(request);
      if (request.taskKind === "runtime_diagnosis") return { response: { kind: "diagnosis", summary: "A notice covers the list.", diagnosis: { patchNeeded: true, explorationNeeded: false } } };
      if (request.taskKind === "evidence_tool_decision") return { response: { kind: "evidence_tool_decision", summary: "Nothing more to look at.", decision: { kind: "complete", result: { findings: "The notice covers the list." } } } };
      const script = scripts.shift() ?? { decline: true };
      if ("fail" in script) throw new Error("The scripted provider was told to fail.");
      if ("decline" in script) return { response: { kind: "no_repair", summary: "Nothing here replaces it.", reason: "several_alike" } };
      return {
        response: { kind: "runtime_patch", summary: "Dismiss the notice, then take the step again.", riskLevel: "medium", patches: script.patches },
        ...(script.costUsd !== undefined ? { usage: { inputTokens: 1_000, outputTokens: 100, totalTokens: 1_100, estimatedCostUsd: script.costUsd } } : {})
      };
    }
  };
  const save = async (adaptation: AutomationStudioFlowAdaptation) => {
    adaptations.set(adaptation.adaptationId, adaptation);
    return adaptation;
  };
  const context = inRunRepairContext(options);
  const ports: AutomationStudioRuntimeRecoveryPorts = {
    resolveLlmProvider: () => ({ provider, maxCallsPerRun: 6, maxTotalTokensPerRun: 100_000, tokenLimits: { maxInputTokens: 40_000, maxOutputTokens: 4_000, maxTotalTokens: 44_000 } }),
    llmEvidenceRuntime: evidenceBinding(),
    reusableLlmContextEnabled: false,
    flowInstructionSet: async () => [],
    reusableLlmContextForFreshEvidence: async () => undefined,
    flowForRecovery: async () => ({ scope: { kind: "domain", domainId: "test.domain" } }),
    saveFlowChangeProposal: async (proposal) => {
      proposals.push(proposal);
      return proposal;
    },
    saveFlowAdaptation: save,
    promoteRuntimeAdaptation: async (request) => await promoteAutomationStudioRuntimeAdaptation({
      ...request,
      ports: { saveFlowAdaptation: save, getFlowAdaptation: async (_projectId, _flowId, id) => adaptations.get(id) ?? null, listFlowAdaptationSummaries: async () => ({ adaptations: [] }) }
    })
  };
  return { ports, context, graphOptions: { inputs: {} }, requests, adaptations, proposals };
}

/** The Subflow graph the run is executing: open, read, end, and a handler the Flow already had. */
export function inRunRepairGraph(): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1",
    flowId: "flow.in-run-repair.graph",
    ownerKind: "policy",
    ownerId: IN_RUN_REPAIR_FLOW_ID,
    name: "Read the list",
    createdAt: 1,
    updatedAt: 1,
    nodes: [
      { id: "open", definitionId: "builtin.data.constant", parameterValues: { value: "open" }, position: { x: 0, y: 0 } },
      { id: "read", definitionId: "builtin.data.constant", label: "Read the list", parameterValues: { value: "read" }, position: { x: 320, y: 0 } },
      { id: "end", definitionId: "builtin.control.end", parameterValues: { resultStatus: "success" }, position: { x: 640, y: 0 } }
    ],
    edges: [
      { id: "open.read", sourceNodeId: "open", sourcePortId: "success", targetNodeId: "read", targetPortId: "in" },
      { id: "read.end", sourceNodeId: "read", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
    ]
  };
}

/** The executor's request at a true failure of `read`, after `open` succeeded and `read` was retried. */
export function inRunRepairRequest(overrides: { incidentId?: string; unit?: AutomationStudioRepairUnit; graph?: AutomationStudioFlowDocument; nodeId?: string } = {}): AutomationStudioIncidentRepairRequest {
  const nodeId = overrides.nodeId ?? "read";
  const failedAttempt: AutomationStudioNodeAttemptTrace = {
    attemptId: `${nodeId}.attempt.4`,
    nodeId,
    definitionId: "builtin.data.constant",
    startedAt: 40,
    finishedAt: 41,
    status: "failed",
    route: "failed",
    inputs: {},
    outputs: {},
    effects: [],
    failure: { category: "target_not_found", code: "test.target.not_found", retryable: false },
    failureClass: "true_failure",
    framePath: ["frame.root"],
    retry: { attemptNumber: 4, maxAttempts: 4, backoffMs: 400, rung: "retry_node", previousAttemptId: `${nodeId}.attempt.3` }
  };
  const opened: AutomationStudioNodeAttemptTrace = { attemptId: "open.attempt.1", nodeId: "open", definitionId: "builtin.data.constant", startedAt: 10, finishedAt: 11, status: "succeeded", route: "success", inputs: {}, outputs: {}, effects: [], framePath: ["frame.root"] };
  return {
    incident: {
      incidentId: overrides.incidentId ?? "incident.1",
      origin: { framePath: ["frame.root"], nodeId, failureCode: "test.target.not_found" },
      handlersRun: [],
      routes: [],
      alternatives: [],
      startedAt: 20,
      trueFailure: true
    },
    unit: overrides.unit ?? { kind: "node", nodeId },
    graph: overrides.graph ?? inRunRepairGraph(),
    subflowId: IN_RUN_REPAIR_SUBFLOW_ID,
    framePath: ["frame.root"],
    failedAttempt,
    attempts: [opened, failedAttempt]
  };
}

function inRunRepairContext(options: { behavior?: Partial<AutomationStudioTrainingModeBehavior>; policy?: Partial<AutomationStudioAdaptationPolicy> }): AutomationStudioRuntimeAdaptationContext {
  return {
    projectId: IN_RUN_REPAIR_PROJECT_ID,
    flowId: IN_RUN_REPAIR_FLOW_ID,
    settings: {
      mode: "continuous_adaptive",
      allowLlmIntervention: true,
      allowRuntimeRecovery: true,
      allowAdaptationCreation: true,
      proposalApprovalMode: "auto",
      allowPromotion: true,
      budgets: { maxTokensPerRun: 200_000, exhaustedBehavior: "stop" }
    },
    policy: { ...inRunRepairPolicy(), ...(options.policy ?? {}) },
    behavior: { invokeLlm: true, runRecovery: true, createAdaptations: true, proposalApprovalMode: "auto", promoteAdaptations: true, ...(options.behavior ?? {}) },
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

function inRunRepairPolicy(): AutomationStudioAdaptationPolicy {
  return {
    schemaVersion: "0.1",
    policyId: "policy.in-run-repair",
    scope: { kind: "flow", flowId: IN_RUN_REPAIR_FLOW_ID },
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

/** The domain: no denied keys, and a page packet captured at the failing step. */
function evidenceBinding(): AutomationStudioLlmEvidenceRuntimeBinding {
  const page: JsonObject = { schemaVersion: "test.page.v1", page: "page.failed", notice: "visible" };
  return {
    domainId: "test.domain",
    deniedEvidenceKeys: [],
    tools: [],
    harnessOptions: { schemaVersion: "0.1", domainId: "test.domain", options: [], implementations: {} },
    executeTool: async () => { throw new Error("No tool runs while the run is held."); },
    captureSanitizedFailureEvidence: async () => page
  };
}
