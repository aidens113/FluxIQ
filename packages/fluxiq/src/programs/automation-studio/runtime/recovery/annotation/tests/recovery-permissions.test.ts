// A recovery is capable by default: it is offered the domain's acting options
// whatever the policy's side-effect flag says, and a press with a lasting
// consequence nobody allowed ends the recovery with a request a person can
// answer -- never a silent refusal, and never a patch call made without it.
//
// Driven through `annotateAutomationStudioRunDetailWithRuntimeLlm` with a
// stand-in domain whose press asks Core first, as a domain is meant to, and a
// policy that forbids external side effects, to show the flag is not read.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type {
  AutomationStudioAdaptationPolicy,
  AutomationStudioFlowInstruction,
  AutomationStudioFlowRunDetail
} from "../../../../model/index.ts";
import { automationStudioInstructionDigest } from "../../../action-permissions/index.ts";
import type {
  AutomationStudioHarnessOptionBundle,
  AutomationStudioLlmProvider,
  AutomationStudioLlmTaskRequest
} from "../../../llm/index.ts";
import { resolveAutomationStudioResultCheckSchedule } from "../../../result-check-schedule/index.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "../../../service.ts";
import { annotateAutomationStudioRunDetailWithRuntimeLlm } from "../annotate.ts";

const FAILURE_PAGE: JsonObject = { schemaVersion: "test.page.v1", page: "page.failed", controls: ["Pick and pack"] };

type Recovery = {
  detail: AutomationStudioFlowRunDetail;
  pressed: string[];
  offered: string[][];
  taskKinds: string[];
  /** What the diagnosis call was told about the policy. */
  diagnosisGates?: JsonObject | undefined;
};

type Setup = {
  permittedConsequences?: string[];
  storedInstructed?: unknown;
  instructions?: AutomationStudioFlowInstruction[];
  /** Whether the diagnosis asks for an exploration first. Default yes. */
  explore?: boolean;
  /** The repair the patch call answers with: a target override declaring these classes. Absent, it declines. */
  repair?: { consequences: string[] };
};

describe("a recovery under its permission gate", () => {
  it("offers the acting option while the policy forbids external side effects, and never a destructive one", async () => {
    const run = await recover({ permittedConsequences: ["modify_existing"] });

    expect(run.offered[0]).toEqual(["test.look", "test.press"]);
  });

  it("ends on a request when a press would lastingly change something nobody allowed, and makes no patch call", async () => {
    const run = await recover({});

    expect(run.pressed).toEqual([]);
    expect(run.taskKinds).toEqual(["runtime_diagnosis", "evidence_tool_decision"]);
    expect(run.detail.metadata?.permissionRequest).toMatchObject({
      schemaVersion: "automation-studio.action-permission-request.v1",
      action: { kind: "exploration_step", id: "test.press", ref: "call.press", verb: "press" },
      control: { name: "Pick and pack", kind: "button" },
      consequences: ["modify_existing"],
      missing: ["modify_existing"],
      reason: { stage: "recovery" },
      authority: { granted: [], instructed: [] }
    });
    const gate = run.detail.metadata?.llmGate as JsonObject;
    expect(gate).toMatchObject({
      patchSkippedCode: "llm.runtime_patch_permission_required",
      patchSkipped: (run.detail.metadata?.permissionRequest as JsonObject).sentence,
      permissions: { granted: [], instructed: [], lapsed: [] }
    });
    expect(run.detail.metadata).not.toHaveProperty("runtimePatchAttempts");
    expect(stage(run.detail, "exploration")).toMatchObject({ status: "refused", detail: { outcome: "user_intervention_required", stopReason: "operator_approval_required" } });
    expect(stage(run.detail, "resolution")).toMatchObject({ status: "skipped", providerCalled: false, detail: { skipCode: "llm.runtime_patch_permission_required" } });
  });

  it("presses when the grant holds the consequence, raises nothing, and goes on to the patch", async () => {
    const run = await recover({ permittedConsequences: ["modify_existing"] });

    expect(run.pressed).toEqual(["Pick and pack"]);
    expect(run.detail.metadata).not.toHaveProperty("permissionRequest");
    expect(run.taskKinds.at(-1)).toBe("runtime_patch");
    expect((run.detail.metadata?.llmGate as JsonObject).permissions).toEqual({ granted: ["modify_existing"], instructed: [], lapsed: [] });
    expect((run.detail.metadata?.llmGate as JsonObject).patchSkippedCode).toBeUndefined();
    // The diagnosis was told what the gate permits, not the policy's "no external side effects".
    expect(run.diagnosisGates).toMatchObject({ actionPermissions: { permitted: ["modify_existing"], granted: ["modify_existing"], instructed: [] } });
    expect(run.diagnosisGates).not.toHaveProperty("allowExternalSideEffects");
  });

  it("presses on the authority of the person's instruction, as the Flow's build stored it", async () => {
    const current = instruction();
    const run = await recover({ instructions: [current], storedInstructed: [stored(current)] });

    expect(run.pressed).toEqual(["Pick and pack"]);
    expect(run.detail.metadata).not.toHaveProperty("permissionRequest");
    expect((run.detail.metadata?.llmGate as JsonObject).permissions).toEqual({ granted: [], instructed: ["modify_existing"], lapsed: [] });
  });

  it("asks again once the instruction that gave that authority has been edited", async () => {
    const original = instruction();
    const run = await recover({ instructions: [{ ...original, body: "Pick and pack only the urgent orders in the dispatch batch." }], storedInstructed: [stored(original)] });

    expect(run.pressed).toEqual([]);
    expect(run.detail.metadata?.permissionRequest).toMatchObject({ missing: ["modify_existing"], authority: { instructed: [] } });
    expect((run.detail.metadata?.llmGate as JsonObject).permissions).toEqual({ granted: [], instructed: [], lapsed: ["modify_existing"] });
  });

  // Item 4. The same gate stands over the patch stage: a repair that would
  // press something lasting each time the Flow runs, and that nobody allowed,
  // is the request the recovery ends on -- not the preflight refusal it was.
  it("turns a repair that would lastingly act into the request, and runs nothing", async () => {
    const run = await recover({ explore: false, repair: { consequences: ["create_new"] } });

    expect(run.taskKinds).toEqual(["runtime_diagnosis", "runtime_patch"]);
    expect(run.detail.metadata?.permissionRequest).toMatchObject({
      action: { kind: "flow_step", id: "builtin.policy.action", ref: "node.action", verb: "press" },
      control: { name: "Pick and pack", kind: "button" },
      consequences: ["create_new"],
      missing: ["create_new"],
      reason: { stage: "recovery" },
      sentence: expect.stringMatching(/^To repair the step that failed, the Flow would press "Pick and pack" \(button\) each time it runs/)
    });
    const gate = run.detail.metadata?.llmGate as JsonObject;
    expect(gate.patchHeldCode).toBe("llm.runtime_patch_permission_required");
    expect(gate).not.toHaveProperty("patchSkippedCode");
    expect(run.detail.metadata?.runtimePatchAttempts).toEqual([expect.objectContaining({ permissionRequired: true, executed: false, missing: ["create_new"] })]);
    expect(run.detail.adaptationIds).toEqual([]);
    expect(stage(run.detail, "resolution")).toMatchObject({ status: "failed", providerCalled: true, detail: { failureCode: "llm.runtime_patch_permission_required" } });
  });

  it("runs the repair as authorized when the grant holds its classes, and raises nothing", async () => {
    const run = await recover({ explore: false, repair: { consequences: ["create_new"] }, permittedConsequences: ["create_new"] });

    expect(run.detail.metadata).not.toHaveProperty("permissionRequest");
    expect(run.detail.metadata?.runtimePatchAttempts).toEqual([expect.objectContaining({ permissionOutcome: "permitted", preflightOk: true })]);
    expect(run.detail.adaptationIds).toHaveLength(1);
    expect(run.detail.metadata?.llmGate).not.toHaveProperty("patchHeldCode");
  });
});

async function recover(setup: Setup): Promise<Recovery> {
  const run: Recovery = { detail: runDetail(), pressed: [], offered: [], taskKinds: [] };
  const provider: AutomationStudioLlmProvider = {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async (request: AutomationStudioLlmTaskRequest) => {
      run.taskKinds.push(request.taskKind);
      if (request.expectedOutput === "diagnosis") {
        run.diagnosisGates = request.context.policyGates;
        return { response: { kind: "diagnosis", summary: "The dispatch control was relabelled.", diagnosis: { explorationNeeded: setup.explore ?? true, patchNeeded: true } } };
      }
      if (request.expectedOutput === "evidence_tool_decision") {
        run.offered.push((request.context.evidenceLoop?.tools ?? []).map((tool) => tool.toolId));
        const decision = request.context.evidenceLoop?.iteration === 1
          ? { kind: "tool_call" as const, callId: "call.press", toolId: "test.press", input: {} }
          : { kind: "complete" as const, result: { findings: "Pick and pack starts the dispatch." } };
        return { response: { kind: "evidence_tool_decision", summary: "Trying the control.", decision } };
      }
      if (setup.repair) {
        return { response: { kind: "runtime_patch", summary: "Re-point the failed step.", riskLevel: "high", patches: [{ kind: "temporary_target_override", targetNodeId: "node.action", target: { handles: { control: "target.1" } }, consequences: setup.repair.consequences as never, reason: "It was relabelled." }] } };
      }
      return { response: { kind: "no_repair", summary: "Nothing to change.", reason: "control_gone" } };
    }
  };
  run.detail = await annotateAutomationStudioRunDetailWithRuntimeLlm({
    ports: {
      resolveLlmProvider: () => ({ provider, maxCallsPerRun: 6, ...(setup.permittedConsequences ? { permittedConsequences: setup.permittedConsequences as never } : {}) }),
      llmEvidenceRuntime: {
        domainId: "test.domain",
        deniedEvidenceKeys: [],
        tools: [],
        harnessOptions: options(run),
        executeTool: async () => { throw new Error("The bare tool slot is not used by this binding."); },
        captureSanitizedFailureEvidence: async () => FAILURE_PAGE,
        validateTargetOverrideEvidence: (_evidence, target) => ({ status: "resolved", target: { handles: target.handles, resolvedBy: "test.domain" }, control: { name: "Pick and pack", kind: "button" } })
      },
      reusableLlmContextEnabled: false,
      flowInstructionSet: async () => setup.instructions ?? [],
      reusableLlmContextForFreshEvidence: async () => undefined,
      flowForRecovery: async () => ({ scope: { kind: "domain", domainId: "test.domain" }, ...(setup.storedInstructed ? { metadata: { bootstrapInstructedConsequences: setup.storedInstructed as JsonObject[] } } : {}) }),
      saveFlowChangeProposal: async (proposal) => proposal,
      saveFlowAdaptation: async (adaptation) => adaptation,
      promoteRuntimeAdaptation: async (input) => input.adaptation
    },
    detail: runDetail(),
    context: context(),
    runtimeFlow: { schemaVersion: "0.1", flowId: "flow.recovery", ownerKind: "policy", ownerId: "project.recovery", name: "Recovery flow", nodes: [{ id: "node.action", definitionId: "builtin.policy.action" }], edges: [], createdAt: 1, updatedAt: 1 },
    failedTraceAttempt: { attemptId: "node.action.attempt.1", nodeId: "node.action", definitionId: "builtin.policy.action", startedAt: 1, finishedAt: 2, status: "failed", route: "failed", inputs: {}, outputs: {}, effects: [], message: "The action failed.", failure: { category: "target_not_found", code: "test.target_not_found", retryable: false } },
    executionGrant: { grantId: "llm-grant:test", actorUserId: "user.test", actorSessionId: "session.test", purpose: "explore_and_adapt" }
  });
  return run;
}

/** One look, one press that asks Core first, and one destructive option nothing may offer. */
function options(run: Recovery): AutomationStudioHarnessOptionBundle {
  const option = (toolId: string, effect: "observe" | "mutate", sideEffect: "observe" | "mutate" | "destructive") => ({
    toolId,
    description: `Run ${toolId}.`,
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    effect,
    availability: { kind: "domain" as const, domainId: "test.domain" },
    safety: { sideEffect },
    stages: ["gather" as const, "iterate" as const]
  });
  return {
    schemaVersion: "0.1",
    domainId: "test.domain",
    options: [option("test.look", "observe", "observe"), option("test.press", "mutate", "mutate"), option("test.clear", "mutate", "destructive")],
    implementations: {
      "test.look": async () => ({ kind: "llm_evidence_tool_execution", evidence: FAILURE_PAGE, effectApplied: false }),
      "test.press": async (input) => {
        const verdict = await input.permission({ consequences: ["modify_existing"], control: { name: "Pick and pack", kind: "button" }, verb: "press" });
        if (!verdict.permitted) return { kind: "llm_evidence_tool_execution", evidence: { pressed: false }, effectApplied: false, resultCode: "test.permission_required" };
        run.pressed.push("Pick and pack");
        return { kind: "llm_evidence_tool_execution", evidence: { page: "page.picking", status: "Picking" }, effectApplied: true };
      },
      "test.clear": async () => ({ kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: true })
    }
  };
}

function stage(detail: AutomationStudioFlowRunDetail, name: string): JsonObject | undefined {
  return (detail.metadata?.recoveryTrace as { stages?: JsonObject[] } | undefined)?.stages?.find((entry) => entry.stage === name);
}

function instruction(): AutomationStudioFlowInstruction {
  return {
    schemaVersion: "0.1",
    instructionId: "instruction.dispatch",
    title: "Dispatch the batch",
    body: "Pick and pack the dispatch batch.",
    scope: { kind: "flow", projectId: "project.recovery", flowId: "flow.recovery" },
    priority: 1,
    status: "active",
    requirement: "advisory",
    createdAt: 1,
    updatedAt: 1
  };
}

function stored(source: AutomationStudioFlowInstruction): JsonObject {
  return { consequence: "modify_existing", instructionId: source.instructionId, instructionDigest: automationStudioInstructionDigest(source), quote: "Pick and pack the dispatch batch" };
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
    policy: policy(),
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

/** Forbids external side effects outright: the gate, not this flag, is what decides a press. */
function policy(): AutomationStudioAdaptationPolicy {
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
    requireApprovalForExternalSideEffects: true,
    createdAt: 1,
    updatedAt: 1
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
    actionAttempts: [{ attemptId: "node.action.attempt.1", nodeId: "node.action", definitionId: "builtin.policy.action", order: 1, status: "failed", startedAt: 1, finishedAt: 2 }],
    interventions: [],
    adaptationIds: [],
    changeProposalIds: []
  };
}
