import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowDocument } from "../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../executor.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioRuntimePatch } from "../../../llm/index.ts";
import type { AutomationStudioRuntimeTargetOverrideEvidenceValidation, AutomationStudioRuntimeTargetOverrideFailedAction } from "../../../live-patch.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "../../../service.ts";
import { applyAutomationStudioRuntimeRecoveryPatches } from "../patches.ts";

// The receipt a refused repair leaves. `run-mu4rpka7-845d919a` reached the
// provider, got a target override back, and recorded only that the preflight
// failed: nothing in the run said the domain had been asked about a
// `builtin.policy.action` node it could not tell was a click, and so refused
// the override before reading its handle. These drive the stage that writes
// the receipt, with the domain's answer supplied by a stub.
describe("applyAutomationStudioRuntimeRecoveryPatches", () => {
  it("asks the domain about the output the recorded node dispatches, and records why it refused", async () => {
    const asked: AutomationStudioRuntimeTargetOverrideFailedAction[] = [];
    const outcome = await apply({ asked, answer: { status: "absent", reason: "parameter_not_offered" } });

    expect(asked).toEqual([{ nodeId: "recorded.press", definitionId: "builtin.policy.action", outputId: "example.output.press" }]);
    expect(outcome.attempts).toEqual([expect.objectContaining({
      kind: "temporary_target_override",
      proposalOnly: true,
      executed: false,
      preflightOk: false,
      issues: ["Target override is absent from current sanitized evidence: the target names a parameter the failed action does not offer (parameter_not_offered)."],
      targetOverrideRefusal: { status: "absent", reason: "parameter_not_offered" }
    })]);
    expect(outcome.adaptationIds).toEqual([]);
    expect(outcome.changeProposalIds).toEqual([]);
  });

  it("records a refusal the domain gave no reason for as its status alone", async () => {
    const outcome = await apply({ asked: [], answer: { status: "ambiguous" } });

    expect(outcome.attempts[0]).toMatchObject({ preflightOk: false, targetOverrideRefusal: { status: "ambiguous" } });
    expect((outcome.attempts[0]?.targetOverrideRefusal as JsonObject | undefined)).not.toHaveProperty("reason");
  });

  // Without a proposal grant the override is executed, and that path never
  // consulted the domain, so its refusals held only on the proposal path.
  it("without a proposal grant, executes an override only through the domain's check", async () => {
    const asked: AutomationStudioRuntimeTargetOverrideFailedAction[] = [];
    const refused = await apply({ asked, answer: { status: "absent", reason: "action_not_repairable" }, explicitProposalGrant: false });

    expect(asked).toEqual([{ nodeId: "recorded.press", definitionId: "builtin.policy.action", outputId: "example.output.press" }]);
    expect(refused.attempts).toEqual([expect.objectContaining({
      kind: "temporary_target_override",
      executed: false,
      preflightOk: false,
      traceStatus: "not-run",
      issues: ["Target override is absent from current sanitized evidence: the failed action offers nothing a repair may re-point (action_not_repairable)."],
      targetOverrideRefusal: { status: "absent", reason: "action_not_repairable" }
    })]);
    expect(refused.adaptationIds).toEqual([]);
    expect(refused.changeProposalIds).toEqual([]);
  });

  it("refuses an override on either path when there was no evidence for the domain to judge it against", async () => {
    for (const explicitProposalGrant of [true, false]) {
      const asked: AutomationStudioRuntimeTargetOverrideFailedAction[] = [];
      const outcome = await apply({ asked, answer: { status: "resolved", target: { handles: { control: "candidate.2" } } }, explicitProposalGrant, failureEvidence: null });

      expect(asked, `grant: ${explicitProposalGrant}`).toEqual([]);
      expect(outcome.attempts[0], `grant: ${explicitProposalGrant}`).toMatchObject({ preflightOk: false, executed: false, traceStatus: "not-run", targetOverrideRefusal: { status: "absent", reason: "domain_check_unavailable" } });
      expect(outcome.adaptationIds).toEqual([]);
    }
  });

  it("records no refusal on an override the domain resolved, and proposes it", async () => {
    const outcome = await apply({ asked: [], answer: { status: "resolved", target: { handles: { control: "candidate.2" }, resolvedBy: "domain" } } });

    expect(outcome.attempts[0]).toMatchObject({ preflightOk: true, proposalOnly: true, executed: false, targetResolution: "resolved" });
    expect(outcome.attempts[0]).not.toHaveProperty("targetOverrideRefusal");
    expect(outcome.adaptationIds).toHaveLength(1);
    expect(outcome.changeProposalIds).toHaveLength(1);
  });
});

async function apply(options: {
  asked: AutomationStudioRuntimeTargetOverrideFailedAction[];
  answer: AutomationStudioRuntimeTargetOverrideEvidenceValidation;
  /** Default `true`: the Lab's `diagnose_and_adapt`. `false` executes the override. */
  explicitProposalGrant?: boolean;
  /** `null`: the domain captured no failure evidence. */
  failureEvidence?: JsonObject | null;
}) {
  const binding: AutomationStudioLlmEvidenceRuntimeBinding = {
    domainId: "example.domain",
    deniedEvidenceKeys: [],
    tools: [],
    executeTool: async () => { throw new Error("No tool is executed while a patch is applied."); },
    validateTargetOverrideEvidence: (_evidence, _target, failedAction) => {
      options.asked.push(failedAction);
      return options.answer;
    }
  };
  const patch: AutomationStudioRuntimePatch = {
    kind: "temporary_target_override",
    targetNodeId: "recorded.press",
    target: { handles: { control: "candidate.2" } },
    reason: "The control was renamed."
  };
  return await applyAutomationStudioRuntimeRecoveryPatches({
    ports: {
      llmEvidenceRuntime: binding,
      saveFlowChangeProposal: async (proposal) => proposal,
      saveFlowAdaptation: async (adaptation) => adaptation,
      promoteRuntimeAdaptation: async (input) => input.adaptation
    },
    context: context(),
    runId: "run.recorded",
    flow: recordedFlow(),
    failedAttempt: failedAttempt(),
    patches: [patch],
    explicitProposalGrant: options.explicitProposalGrant ?? true,
    ...(options.failureEvidence === null ? {} : { failureEvidence: options.failureEvidence ?? { schemaVersion: "example.failure-evidence.v1", controls: ["candidate.1", "candidate.2"] } }),
    // The executed path is otherwise refused by the policy before the domain is
    // asked, which would hide whether the domain's check gates it.
    authorizedExternalSideEffects: true
  });
}

/** Two recorded actions, written the way approving a recording writes them. */
function recordedFlow(): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1",
    flowId: "flow.recorded",
    ownerKind: "routine",
    ownerId: "routine.recorded",
    name: "Recorded Flow",
    createdAt: 1,
    updatedAt: 1,
    nodes: [
      { id: "recorded.fill", definitionId: "builtin.policy.action", parameterValues: { outputId: "example.output.fill", parameters: { control: "recorded.fill" } } },
      { id: "recorded.press", definitionId: "builtin.policy.action", parameterValues: { outputId: "example.output.press", parameters: { control: "recorded.press" } } }
    ],
    edges: [{ id: "fill.press", sourceNodeId: "recorded.fill", sourcePortId: "success", targetNodeId: "recorded.press", targetPortId: "ready" }]
  };
}

function failedAttempt(): AutomationStudioNodeAttemptTrace {
  return {
    attemptId: "recorded.press.attempt.1",
    nodeId: "recorded.press",
    definitionId: "builtin.policy.action",
    startedAt: 1,
    finishedAt: 2,
    status: "failed",
    route: "failed",
    inputs: {},
    outputs: {},
    effects: [],
    message: "The recorded control was not found."
  };
}

function context(): AutomationStudioRuntimeAdaptationContext {
  return {
    projectId: "project.recorded",
    flowId: "flow.recorded",
    settings: {
      mode: "continuous_adaptive",
      allowLlmIntervention: true,
      allowRuntimeRecovery: true,
      allowAdaptationCreation: true,
      proposalApprovalMode: "manual",
      allowPromotion: false,
      budgets: { exhaustedBehavior: "stop" }
    },
    policy: policy(),
    behavior: { invokeLlm: true, runRecovery: false, createAdaptations: true, proposalApprovalMode: "manual", promoteAdaptations: true },
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
    runsCompleted: 0,
    recentRunCount: 0,
    recentAdaptationCount: 0,
    recentAdaptations: [],
    diagnostics: []
  };
}

function policy(): AutomationStudioAdaptationPolicy {
  return {
    schemaVersion: "0.1",
    policyId: "policy.recorded",
    scope: { kind: "flow", flowId: "flow.recorded" },
    preset: "adaptive",
    proposalMode: "manual",
    allowRuntimeRecovery: true,
    allowCreateRecoveryPaths: true,
    allowModifySubflows: true,
    allowCreateSubflows: true,
    allowModifyRouter: true,
    allowModifyExpectations: true,
    allowModifyActionTargets: true,
    allowDeleteOrDisableBehavior: false,
    allowExternalSideEffects: true,
    requireApprovalForDestructiveChanges: true,
    requireApprovalForExternalSideEffects: true,
    createdAt: 1,
    updatedAt: 1
  };
}
