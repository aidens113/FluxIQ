// A recovery is capable by default: it is offered the domain's acting options
// whatever the policy's side-effect flag says, and a press that would destroy
// something nobody allowed ends the recovery with a request a person can
// answer -- never a silent refusal, and never a patch call made without it.
//
// The press declares `delete`, which the gate still asks about. It declared
// `modify_existing` until 2026-09-26, and that class is no longer gated: on it,
// every row here that presses "when the run permits the consequence" would have
// pressed with nothing permitted at all and proved nothing.
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

const FAILURE_PAGE: JsonObject = { schemaVersion: "test.page.v1", page: "page.failed", controls: ["Pick and pack", "Cancel unfilled lines"] };

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
    const run = await recover({ permittedConsequences: ["delete"] });

    expect(run.offered[0]).toEqual(["test.look", "test.press"]);
  });

  it("ends on a request when a press would lastingly change something nobody allowed, and makes no patch call", async () => {
    const run = await recover({});

    expect(run.pressed).toEqual([]);
    expect(run.taskKinds).toEqual(["runtime_diagnosis", "evidence_tool_decision"]);
    expect(run.detail.metadata?.permissionRequest).toMatchObject({
      schemaVersion: "automation-studio.action-permission-request.v1",
      action: { kind: "exploration_step", id: "test.press", ref: "call.press", verb: "press" },
      control: { name: "Cancel unfilled lines", kind: "button" },
      consequences: ["delete"],
      missing: ["delete"],
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

  it("presses when the run permits the consequence, raises nothing, and goes on to the patch", async () => {
    const run = await recover({ permittedConsequences: ["delete"] });

    expect(run.pressed).toEqual(["Cancel unfilled lines"]);
    expect(run.detail.metadata).not.toHaveProperty("permissionRequest");
    expect(run.taskKinds.at(-1)).toBe("runtime_patch");
    expect((run.detail.metadata?.llmGate as JsonObject).permissions).toEqual({ granted: ["delete"], instructed: [], lapsed: [] });
    expect((run.detail.metadata?.llmGate as JsonObject).patchSkippedCode).toBeUndefined();
    // The diagnosis was told what the gate permits, not the policy's "no external side effects".
    expect(run.diagnosisGates).toMatchObject({ actionPermissions: { permitted: ["delete"], granted: ["delete"], instructed: [] } });
    expect(run.diagnosisGates).not.toHaveProperty("allowExternalSideEffects");
  });

  // Until 2026-09-30 the stored instruction pressed on its own authority. A
  // deletion now needs a person's permission every time; the instruction's
  // words travel with the question instead.
  it("asks rather than pressing on the authority of the person's instruction, and says what it asked for", async () => {
    const current = instruction();
    const run = await recover({ instructions: [current], storedInstructed: [stored(current)] });

    expect(run.pressed).toEqual([]);
    expect(run.detail.metadata?.permissionRequest).toMatchObject({ missing: ["delete"], authority: { granted: [], instructed: [expect.objectContaining({ consequence: "delete" })] } });
    expect((run.detail.metadata?.llmGate as JsonObject).permissions).toEqual({ granted: [], instructed: ["delete"], lapsed: [] });
  });

  it("asks again once the instruction that gave that authority has been edited", async () => {
    const original = instruction();
    const run = await recover({ instructions: [{ ...original, body: "Pick and pack only the urgent orders in the dispatch batch." }], storedInstructed: [stored(original)] });

    expect(run.pressed).toEqual([]);
    expect(run.detail.metadata?.permissionRequest).toMatchObject({ missing: ["delete"], authority: { instructed: [] } });
    expect((run.detail.metadata?.llmGate as JsonObject).permissions).toEqual({ granted: [], instructed: [], lapsed: ["delete"] });
  });

  // Item 4. The same gate stands over the patch stage: a repair that would
  // destroy or spend something each time the Flow runs, and that nobody
  // allowed, is the request the recovery ends on -- not the preflight refusal
  // it was, and not a receipt nobody is shown.
  it("turns a repair that would destructively act into the request, and runs nothing", async () => {
    const run = await recover({ explore: false, repair: { consequences: ["delete"] } });

    expect(run.taskKinds).toEqual(["runtime_diagnosis", "runtime_patch"]);
    expect(run.detail.metadata?.permissionRequest).toMatchObject({
      action: { kind: "flow_step", id: "builtin.policy.action", ref: "node.action", verb: "press" },
      control: { name: "Pick and pack", kind: "button" },
      consequences: ["delete"],
      missing: ["delete"],
      reason: { stage: "recovery" },
      sentence: expect.stringMatching(/^To fix the step that failed, the Flow would press "Pick and pack" \(button\) each time it runs/)
    });
    const gate = run.detail.metadata?.llmGate as JsonObject;
    expect(gate.patchHeldCode).toBe("llm.runtime_patch_permission_required");
    expect(gate).not.toHaveProperty("patchSkippedCode");
    expect(run.detail.metadata?.runtimePatchAttempts).toEqual([expect.objectContaining({ permissionRequired: true, executed: false, missing: ["delete"] })]);
    expect(run.detail.adaptationIds).toEqual([]);
    expect(stage(run.detail, "resolution")).toMatchObject({ status: "failed", providerCalled: true, detail: { failureCode: "llm.runtime_patch_permission_required" } });
  });

  // The repair the Lab could never run live. Nothing is granted, no instructed
  // set stands, and the repair still presses the control -- because making
  // something new was never the gate's to refuse, and a patch the gate permits
  // is not judged by the policy's side-effect flags.
  it("runs a repair that only makes something new, with nothing granted and nobody asked", async () => {
    const run = await recover({ explore: false, repair: { consequences: ["create_new"] } });

    expect(run.detail.metadata).not.toHaveProperty("permissionRequest");
    expect(run.detail.metadata?.runtimePatchAttempts).toEqual([expect.objectContaining({ permissionOutcome: "permitted", preflightOk: true })]);
    expect(run.detail.adaptationIds).toHaveLength(1);
    expect(run.detail.metadata?.llmGate).not.toHaveProperty("patchHeldCode");
  });

  it("runs the repair as authorized when the run permits its destructive classes, and raises nothing", async () => {
    const run = await recover({ explore: false, repair: { consequences: ["delete"] }, permittedConsequences: ["delete"] });

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
      resolveLlmProvider: () => ({ provider, maxCallsPerRun: 6 }),
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
    llmExecution: { actorUserId: "user.test", actorSessionId: "session.test", intent: "explore_and_adapt" },
    ...(setup.permittedConsequences ? { permittedConsequences: setup.permittedConsequences as never } : {})
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
        const verdict = await input.permission({ consequences: ["delete"], control: { name: "Cancel unfilled lines", kind: "button" }, verb: "press" });
        if (!verdict.permitted) return { kind: "llm_evidence_tool_execution", evidence: { pressed: false }, effectApplied: false, resultCode: "test.permission_required" };
        run.pressed.push("Cancel unfilled lines");
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
    body: "Pick and pack the dispatch batch, cancelling any line the warehouse cannot fill.",
    scope: { kind: "flow", projectId: "project.recovery", flowId: "flow.recovery" },
    priority: 1,
    status: "active",
    requirement: "advisory",
    createdAt: 1,
    updatedAt: 1
  };
}

function stored(source: AutomationStudioFlowInstruction): JsonObject {
  return { consequence: "delete", instructionId: source.instructionId, instructionDigest: automationStudioInstructionDigest(source), quote: "cancelling any line the warehouse cannot fill" };
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
