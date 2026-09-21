// The runtime recovery path: a failed run, worked on, and what it cost.
//
// This was a private method on `AutomationStudioService`, and being there had
// two costs that had nothing to do with what it does. `service.ts` is frozen at
// its own line count, so the loop's later stages had to be argued for against a
// budget rather than on their merits -- Phase 2.3's exploration was written, the
// tests passed, and it could not be called from anywhere because the call was
// eleven lines the file did not have. And nothing could drive the path without a
// service, a project directory and a real failed run, so the assertions anyone
// wrote about a recovery were about the pure functions it happened to call.
//
// The path itself is unchanged by the move. It is the loop's four stages at the
// failure entry point:
//
// 1. **Diagnosis.** The gate decides whether a model is asked at all --
//    deterministic-first, so a known recovery or a reroute stops the provider
//    being resolved. Then one `runtime_diagnosis` call at `stage: "gather"`.
// 2. **Plan.** Deterministic, no provider call: what the diagnosis and the
//    policy between them allow to be asked for.
// 3. **Exploration.** Bounded, and only where the plan asked for one.
// 4. **Resolution.** One `runtime_patch` call, then each patch executed or
//    proposed, with a receipt either way.
//
// Every early return carries a `recoveryTrace`, and that is the property to
// keep. A recovery that stopped at the gate, one whose provider would not
// resolve and one that ran all four stages each describe themselves in the same
// four-stage vocabulary, so "nothing happened" is always a stage saying so
// rather than an absent record.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../executor.ts";
import {
  AUTOMATION_STUDIO_LLM_MAX_FAILURE_EVIDENCE_BYTES,
  AUTOMATION_STUDIO_NO_REPAIR_REASONS,
  AutomationStudioLlmRunBudgetLedger,
  resolveAutomationStudioLlmTokenLimits,
  runAutomationStudioLlmHarness,
  sanitizeAutomationStudioLlmFailureEvidence,
  type AutomationStudioLlmProvider
} from "../../llm/index.ts";
import type { executeAutomationStudioRuntimePatch } from "../../live-patch.ts";
import { flowRunSummaryWithInterventionSummaries } from "../../service/index.ts";
import type {
  AutomationStudioLlmProviderResolution,
  AutomationStudioLlmProviderResolverInput,
  AutomationStudioRuntimeAdaptationContext
} from "../../service.ts";
import { buildAutomationStudioRuntimeRecoveryContext } from "../context.ts";
import { summarizeAutomationStudioRuntimeRecoveryContext } from "../context-summary.ts";
import { decideAutomationStudioRuntimeLlmInvocation } from "../llm-invocation.ts";
import { planAutomationStudioRuntimeRecovery } from "../plan.ts";
import { startAutomationStudioRecoveryDeadline } from "../recovery-deadline.ts";
import { automationStudioRuntimeRecoveryRefusedTrace, automationStudioRuntimeRecoveryTrace } from "../stages.ts";
import { summarizeAutomationStudioRuntimeStructuredDiagnosis } from "../structured-diagnosis.ts";
import { runAutomationStudioRecoveryExploration, type AutomationStudioRecoveryExplorationResult } from "./exploration.ts";
import { holdAutomationStudioRecoveryPatchReserve } from "./patch-reserve.ts";
import { applyAutomationStudioRuntimeRecoveryPatches, automationStudioDeclinedRepairAttempt } from "./patches.ts";
import type { AutomationStudioRuntimeRecoveryPorts } from "./ports.ts";
import { resolveAutomationStudioRecoveryRunBudget } from "./run-budget.ts";

export type AutomationStudioRuntimeRecoveryAnnotationInput = {
  ports: AutomationStudioRuntimeRecoveryPorts;
  detail: AutomationStudioFlowRunDetail;
  context: AutomationStudioRuntimeAdaptationContext | null;
  // Each optional field is written `| undefined` because the service passes its
  // own optional input straight through, and `exactOptionalPropertyTypes`
  // distinguishes "absent" from "present and undefined".
  runtimeFlow?: AutomationStudioFlowDocument | undefined;
  subflowId?: string | undefined;
  failedTraceAttempt?: Parameters<typeof executeAutomationStudioRuntimePatch>[0]["failedAttempt"] | undefined;
  authorizedExternalSideEffects?: boolean | undefined;
  graphOptions?: AutomationStudioGraphExecutionOptions | undefined;
  executionGrant?: AutomationStudioLlmProviderResolverInput["executionGrant"] | undefined;
  useReusableContext?: true | undefined;
};

/** One failed run, taken through the loop's four stages at the failure entry point. */
export async function annotateAutomationStudioRunDetailWithRuntimeLlm(
  input: AutomationStudioRuntimeRecoveryAnnotationInput
): Promise<AutomationStudioFlowRunDetail> {
  const ports = input.ports;
  if (!input.context) return input.detail;
  if (input.detail.summary.status !== "failed") return input.detail;
  // A person who authorized this run said what it may spend, so the run is held
  // to that rather than to the training settings' no-grant budget -- including
  // an exploring run, whose grant is the one most likely to need more than it.
  const grantPurpose = input.executionGrant?.purpose;
  const explicitGrantBudget = grantPurpose === "diagnose_and_adapt" || grantPurpose === "diagnosis_only" || grantPurpose === "explore_and_adapt";
  const executionPurpose = grantPurpose === "diagnose_and_adapt" || grantPurpose === "explore_and_adapt" ? { executionPurpose: grantPurpose } : {};
  // The one early return that used to leave no trace. A run refused here is a
  // run nothing will ever repair, so it has to say so in the same four-stage
  // vocabulary as every other outcome; without that, a Flow created with LLM
  // intervention off looked exactly like a Flow whose recovery ran and found
  // nothing to change. The `code` is the same answer for a reader that must
  // not carry a sentence, such as an evaluation.
  if (!input.context.behavior.invokeLlm || (!explicitGrantBudget && !input.context.budgetDecision.ok)) {
    const trainingRefused = !input.context.behavior.invokeLlm;
    const refusal = trainingRefused
      ? "Current training mode or settings do not allow LLM intervention."
      : `Training budget exhausted: ${input.context.budgetDecision.exhausted.join(", ")}.`;
    return {
      ...input.detail,
      metadata: {
        ...(input.detail.metadata ?? {}),
        llmGate: { invoked: false, code: trainingRefused ? "llm.gate.training_mode" : "llm.gate.training_budget_exhausted", reason: refusal },
        recoveryTrace: automationStudioRuntimeRecoveryRefusedTrace(refusal) as unknown as JsonObject
      }
    };
  }
  // One clock for the whole recovery, started once and read from by every stage
  // that follows. Starting it inside the exploration instead would make it that
  // exploration's clock, which is the distinction `recovery-deadline.ts` exists
  // to keep: "this exploration needs longer" and "the recovery as a whole needs
  // longer" are different pieces of advice.
  const recoveryDeadline = startAutomationStudioRecoveryDeadline({ startedAtMs: Date.now() });
  const invocation = decideAutomationStudioRuntimeLlmInvocation({ projectId: input.context.projectId, flowId: input.context.flowId, runId: input.detail.summary.runId, ...(input.subflowId ? { subflowId: input.subflowId } : {}), settings: input.context.settings, policy: input.context.policy, runsCompleted: input.context.runsCompleted, stabilityScore: input.context.metrics.stabilityScore, budgetState: input.context.budgetState, ...(input.failedTraceAttempt ? { failedAttempt: input.failedTraceAttempt } : {}), adaptations: input.context.recentAdaptations });
  // Deterministic-first: a known recovery or a reroute must run before the model is asked, and the provider is not even resolved when one is available.
  if (!invocation.invoke) return { ...input.detail, metadata: { ...(input.detail.metadata ?? {}), llmGate: { invoked: false, code: `llm.gate.${invocation.requiredPriorAction}`, reason: invocation.reason, requiredPriorAction: invocation.requiredPriorAction }, recoveryTrace: automationStudioRuntimeRecoveryTrace({ invocation, policy: input.context.policy }) as unknown as JsonObject } };
  const failedAttempt = [...(input.detail.actionAttempts ?? [])].reverse().find((attempt) => attempt.status === "failed" || attempt.status === "unknown");
  const providerId = settingString(input.context.policy.metadata?.llmProvider, settingString(input.context.policy.policyId, "host"));
  let provider: AutomationStudioLlmProvider | undefined;
  let providerResolution: AutomationStudioLlmProviderResolution | undefined;
  try {
    const resolvedProvider = await ports.resolveLlmProvider?.({
      projectId: input.context.projectId,
      flowId: input.context.flowId,
      providerId,
      ...(input.executionGrant ? { executionGrant: input.executionGrant } : {}),
      ...(input.context.policy.metadata ? { metadata: input.context.policy.metadata } : {})
    });
    if (resolvedProvider && "provider" in resolvedProvider) {
      providerResolution = resolvedProvider;
      provider = resolvedProvider.provider;
    } else {
      provider = resolvedProvider;
    }
  } catch {
    return {
      ...input.detail,
      interventions: [...(input.detail.interventions ?? []), {
        schemaVersion: "0.1",
        interventionId: `llm.provider-resolution.${input.detail.summary.runId}`,
        runId: input.detail.summary.runId,
        flowId: input.context.flowId,
        projectId: input.context.projectId,
        kind: "diagnosis",
        reason: "LLM provider resolution failed.",
        validation: { ok: false, issues: ["llm.provider_resolution_failed: LLM provider resolution failed."] },
        createdAt: input.detail.summary.updatedAt || Date.now()
      }],
      metadata: { ...(input.detail.metadata ?? {}), llmGate: { invoked: false, reason: "LLM provider resolution failed.", code: "llm.provider_resolution_failed" }, recoveryTrace: automationStudioRuntimeRecoveryTrace({ invocation, policy: input.context.policy, diagnosisFailure: "LLM provider resolution failed." }) as unknown as JsonObject }
    };
  }
  const instructions = await ports.flowInstructionSet({
    projectId: input.context.projectId,
    flowId: input.context.flowId
  }).catch(() => []);
  // What the run may spend: its cost ceiling and token budget, with the call
  // count only a runaway backstop. `run-budget.ts` says why each number is what
  // it is; the clock and the progress guard live in the exploration ledger.
  const budget = resolveAutomationStudioRecoveryRunBudget({
    explicitGrantBudget,
    resolution: providerResolution,
    maxTokensPerRun: input.context.settings.budgets?.maxTokensPerRun,
    policyMaxEstimatedCostUsdPerRun: input.context.policy.maxEstimatedCostUsdPerRun
  });
  const maxEstimatedCostUsdPerCall = budget.maxEstimatedCostUsdPerCall;
  const requestedTokenLimits = providerResolution?.tokenLimits;
  let failureEvidence: JsonObject | undefined;
  if (provider && failedAttempt && ports.llmEvidenceRuntime?.captureSanitizedFailureEvidence) {
    const resolvedTokenLimits = resolveAutomationStudioLlmTokenLimits(requestedTokenLimits).limits;
    const maxEvidenceBytes = Math.max(1, Math.min(
      AUTOMATION_STUDIO_LLM_MAX_FAILURE_EVIDENCE_BYTES,
      Math.floor(resolvedTokenLimits.maxInputTokens * 3 * FAILURE_EVIDENCE_INPUT_SHARE)
    ));
    try {
      const captured = await ports.llmEvidenceRuntime.captureSanitizedFailureEvidence({
        projectId: input.context.projectId,
        flowId: input.context.flowId,
        runId: input.detail.summary.runId,
        failedAction: {
          attemptId: failedAttempt.attemptId,
          nodeId: failedAttempt.nodeId,
          definitionId: failedAttempt.definitionId,
          status: failedAttempt.status,
          ...(failedAttempt.route ? { route: failedAttempt.route } : {})
        },
        maxEvidenceBytes,
        ...(input.graphOptions?.signal ? { signal: input.graphOptions.signal } : {})
      });
      if (captured !== undefined) {
        const sanitized = sanitizeAutomationStudioLlmFailureEvidence("runtime_diagnosis", captured, ports.llmEvidenceRuntime?.deniedEvidenceKeys);
        if (Buffer.byteLength(JSON.stringify(sanitized), "utf8") > maxEvidenceBytes) {
          throw new Error("Sanitized failure evidence exceeds the dynamic request allowance.");
        }
        failureEvidence = sanitized;
      }
    } catch {
      return {
        ...input.detail,
        interventions: [...input.detail.interventions, {
          schemaVersion: "0.1",
          interventionId: `llm.failure-evidence.${input.detail.summary.runId}`,
          runId: input.detail.summary.runId,
          flowId: input.context.flowId,
          projectId: input.context.projectId,
          kind: "diagnosis",
          reason: "Sanitized runtime failure evidence was unavailable.",
          validation: { ok: false, issues: ["llm.failure_evidence_invalid: Sanitized runtime failure evidence was unavailable."] },
          createdAt: input.detail.summary.updatedAt || Date.now()
        }],
        metadata: { ...(input.detail.metadata ?? {}), llmGate: { invoked: false, providerConfigured: true, code: "llm.failure_evidence_invalid" }, recoveryTrace: automationStudioRuntimeRecoveryTrace({ invocation, policy: input.context.policy, diagnosisFailure: "Sanitized runtime failure evidence was unavailable." }) as unknown as JsonObject }
      };
    }
  }
  const runBudget = new AutomationStudioLlmRunBudgetLedger(budget.ledger);
  const reusableContextResult = input.useReusableContext === true && failureEvidence
    ? await ports.reusableLlmContextForFreshEvidence({
      optedIn: true, taskKind: "runtime_diagnosis", projectId: input.context.projectId, flowId: input.context.flowId,
      ...(input.subflowId ? { subflowId: input.subflowId } : {}), freshEvidence: failureEvidence, freshEvidenceCount: 1,
      maxInputTokens: resolveAutomationStudioLlmTokenLimits(requestedTokenLimits).limits.maxInputTokens,
      ...(input.executionGrant?.actorUserId ? { actorId: input.executionGrant.actorUserId } : {}), now: input.detail.summary.updatedAt || Date.now()
    })
    : input.useReusableContext === true && ports.reusableLlmContextEnabled
      ? { metadata: { status: "miss", reason: "fresh_evidence_required", freshContributionCount: 0, reusedContributionCount: 0, sourceRecordIds: [], sourceRunIds: [], sourceAdaptationIds: [] } as JsonObject }
      : undefined;
  const recoveryContext = buildAutomationStudioRuntimeRecoveryContext({ detail: input.detail, ...(input.failedTraceAttempt ? { failedAttempt: input.failedTraceAttempt } : {}), ...(input.subflowId ? { subflowId: input.subflowId } : {}), adaptations: input.context.recentAdaptations });
  const now = () => input.detail.summary.updatedAt || Date.now();
  const result = await runAutomationStudioLlmHarness({
    taskKind: "runtime_diagnosis", stage: "gather",
    projectId: input.context.projectId,
    flowId: input.context.flowId,
    runId: input.detail.summary.runId,
    ...(input.subflowId ? { subflowId: input.subflowId } : {}),
    ...(failedAttempt?.nodeId ? { nodeId: failedAttempt.nodeId } : {}),
    instructions,
    runDetail: input.detail,
    ...(failureEvidence ? { failureEvidence } : {}), ...(ports.llmEvidenceRuntime?.deniedEvidenceKeys ? { deniedEvidenceKeys: ports.llmEvidenceRuntime.deniedEvidenceKeys } : {}), recoveryContext,
    ...(reusableContextResult?.packet ? { reusableContext: reusableContextResult.packet } : {}),
    policy: input.context.policy,
    ...(provider ? { provider } : {}),
    runBudget,
    ...(requestedTokenLimits ? { tokenLimits: requestedTokenLimits } : {}),
    ...(providerResolution?.timeoutMs !== undefined ? { timeoutMs: providerResolution.timeoutMs } : {}),
    maxEstimatedCostUsd: maxEstimatedCostUsdPerCall,
    ...(input.graphOptions?.signal ? { signal: input.graphOptions.signal } : {}),
    now,
    metadata: { source: "runRuntimeSession", expectedOutput: "diagnosis", ...executionPurpose }
  });
  // Stage B: the plan decides whether a patch is asked for at all, from the structured diagnosis and the policy, with no provider call.
  const plan = planAutomationStudioRuntimeRecovery({ ...(invocation.diagnosis ? { deterministic: invocation.diagnosis } : {}), result, policy: input.context.policy });
  const explicitProposalGrant = input.executionGrant?.purpose === "diagnose_and_adapt";
  // A `diagnose_and_adapt` grant buys one target override and nothing else, and
  // its schema makes the model name one. Where the plan allows none for this
  // failure, the call could only return a substitute, so it is not made, and
  // the exploration that would have served it is not run either.
  const grantSkip = explicitProposalGrant && plan.patchRequest.request ? grantSkipReason(plan) : undefined;
  const patchWillFollow = Boolean(plan.patchRequest.request && !grantSkip && provider && input.runtimeFlow && input.failedTraceAttempt && input.context.behavior.createAdaptations);
  const patchSkippedCode = grantSkip
    ? "llm.runtime_patch_grant_scope_refused"
    : !plan.patchRequest.request
      ? "llm.runtime_patch_not_requested"
      : !patchWillFollow
        ? "llm.runtime_patch_unavailable"
        : undefined;
  // Stage C. `explorationRequested` is the plan's word and this is the only
  // thing that acts on it; before this the flag was recorded and never read.
  let explorationResult: AutomationStudioRecoveryExplorationResult | undefined;
  if (plan.explorationRequested && plan.patchRequest.request && !grantSkip && provider && ports.llmEvidenceRuntime) {
    const scope = await ports.flowScope(input.context.projectId, input.context.flowId);
    // The patch's call, tokens and money are set aside before the exploration
    // may spend anything, and handed back the moment it ends.
    const patchReserve = scope && patchWillFollow
      ? holdAutomationStudioRecoveryPatchReserve({ runBudget, runId: input.detail.summary.runId, declaredCallsPerRun: budget.declaredCallsPerRun, tokenLimits: requestedTokenLimits, maxEstimatedCostUsd: maxEstimatedCostUsdPerCall })
      : undefined;
    try {
      explorationResult = scope ? await runAutomationStudioRecoveryExploration({
        binding: ports.llmEvidenceRuntime,
        scope,
        // Authoritative over side effects. `allowSideEffectsWithoutPolicy` is
        // absent because a runtime recovery always has a policy, so a mutating
        // option appears exactly when the policy allows external side effects.
        policy: input.context.policy,
        provider,
        context: {
          projectId: input.context.projectId,
          flowId: input.context.flowId,
          runId: input.detail.summary.runId,
          ...(input.subflowId ? { subflowId: input.subflowId } : {}),
          ...(failedAttempt?.nodeId ? { nodeId: failedAttempt.nodeId } : {})
        },
        instructions,
        runDetail: input.detail,
        recoveryContext,
        ...(reusableContextResult?.packet ? { reusableContext: reusableContextResult.packet } : {}),
        runBudget,
        ...(requestedTokenLimits ? { tokenLimits: requestedTokenLimits } : {}),
        ...(providerResolution?.timeoutMs !== undefined ? { timeoutMs: providerResolution.timeoutMs } : {}),
        maxEstimatedCostUsd: maxEstimatedCostUsdPerCall,
        recoveryDeadline,
        ...(patchReserve?.explorationBudget ? { budget: patchReserve.explorationBudget } : {}),
        ...(input.graphOptions?.signal ? { signal: input.graphOptions.signal } : {})
      }) : undefined;
    } finally {
      patchReserve?.release();
    }
  }
  const exploration = explorationResult?.exploration;
  // Stage D sees what the exploration saw. Without this the patch was shown
  // the failure packet alone, and a control only the exploration revealed
  // could not be named in the repair. No packets, no slot: the request is the
  // one it always was.
  const explorationEvidence = explorationResult && explorationResult.explored.length > 0
    ? { packets: explorationResult.explored, maxBytes: Math.max(1, Math.floor(resolveAutomationStudioLlmTokenLimits(requestedTokenLimits).limits.maxInputTokens * 3 * EXPLORATION_EVIDENCE_INPUT_SHARE)) }
    : undefined;
  const patchResult = patchWillFollow && provider && input.runtimeFlow && input.failedTraceAttempt
    ? await runAutomationStudioLlmHarness({
      taskKind: "runtime_patch", stage: "implement", previousStage: "plan",
      projectId: input.context.projectId,
      flowId: input.context.flowId,
      runId: input.detail.summary.runId,
      ...(input.subflowId ? { subflowId: input.subflowId } : {}),
      ...(failedAttempt?.nodeId ? { nodeId: failedAttempt.nodeId } : {}),
      instructions,
      runDetail: input.detail,
      ...(failureEvidence ? { failureEvidence } : {}), ...(ports.llmEvidenceRuntime?.deniedEvidenceKeys ? { deniedEvidenceKeys: ports.llmEvidenceRuntime.deniedEvidenceKeys } : {}), recoveryContext,
      // The plan the stage instruction tells it to carry out. The model's own
      // answer one call earlier, not Core's reading of it.
      ...(result.response?.kind === "diagnosis" && result.response.diagnosis ? { diagnosis: result.response.diagnosis } : {}),
      ...(explorationEvidence ? { explorationEvidence } : {}),
      ...(reusableContextResult?.packet ? { reusableContext: reusableContextResult.packet } : {}),
      policy: input.context.policy,
      provider,
      runBudget,
      ...(requestedTokenLimits ? { tokenLimits: requestedTokenLimits } : {}),
      ...(providerResolution?.timeoutMs !== undefined ? { timeoutMs: providerResolution.timeoutMs } : {}),
      maxEstimatedCostUsd: maxEstimatedCostUsdPerCall,
      ...(input.graphOptions?.signal ? { signal: input.graphOptions.signal } : {}),
      expectedOutput: "runtime_patch",
      now,
      metadata: { source: "runRuntimeSession", expectedOutput: "runtime_patch", ...executionPurpose }
    })
    : null;
  // The model's own refusal: an answer to the patch call rather than a failure
  // of it. It proposes nothing and changes nothing, and is recorded beside the
  // patch attempts, where a reader asking what the recovery did will look.
  const declined = patchResult?.response?.kind === "no_repair" ? patchResult.response : undefined;
  // A patch call can end before it has a response (provider preflight, budget,
  // transport, or structured-output validation). That is a resolution-stage
  // failure, not the same outcome as a valid call that produced no change.
  // Preserve only Core's categorical code; provider text never enters the
  // recovery trace.
  const patchFailureCode = patchResult && !patchResult.ok
    ? patchResult.diagnostics.find((diagnostic) => diagnostic.severity === "error")?.code ?? "llm.runtime_patch_failed"
    : undefined;
  const applied = patchResult?.response?.kind === "runtime_patch" && input.runtimeFlow && input.failedTraceAttempt
    ? await applyAutomationStudioRuntimeRecoveryPatches({
      ports,
      context: input.context,
      runId: input.detail.summary.runId,
      ...(input.subflowId ? { subflowId: input.subflowId } : {}),
      flow: input.runtimeFlow,
      failedAttempt: input.failedTraceAttempt,
      patches: patchResult.response.patches,
      allowedPatchKinds: plan.allowedPatchKinds,
      explicitProposalGrant,
      ...(failureEvidence ? { failureEvidence } : {}),
      // What the request carried, not what the exploration returned: a handle
      // is checked only against a packet the model was actually shown.
      ...(patchResult.request.context.explorationEvidence ? { explorationEvidence: patchResult.request.context.explorationEvidence } : {}),
      ...(reusableContextResult ? { reusableContextMetadata: reusableContextResult.metadata } : {}),
      ...(input.authorizedExternalSideEffects !== undefined ? { authorizedExternalSideEffects: input.authorizedExternalSideEffects } : {}),
      ...(input.graphOptions ? { graphOptions: input.graphOptions } : {})
    })
    : { attempts: [], adaptationIds: [], changeProposalIds: [] };
  const attempts = declined ? [...applied.attempts, automationStudioDeclinedRepairAttempt(declined.reason)] : applied.attempts;
  // One line per provider call, beside the totals they add up to. The
  // interventions below keep only the diagnosis and the patch; the calls that
  // gathered evidence between them leave none, and are itemized only here.
  const providerCalls = runBudget.callRecords(input.detail.summary.runId);
  const withIntervention: AutomationStudioFlowRunDetail = {
    ...input.detail,
    interventions: [...input.detail.interventions, result.intervention, ...(patchResult ? [patchResult.intervention] : [])],
    adaptationIds: [...new Set([...input.detail.adaptationIds, ...applied.adaptationIds])],
    changeProposalIds: [...new Set([...input.detail.changeProposalIds, ...applied.changeProposalIds])],
    metadata: {
      ...(input.detail.metadata ?? {}),
      llmGate: {
        invoked: Boolean(provider),
        providerConfigured: Boolean(provider),
        ok: result.ok && (patchResult?.ok ?? true),
        costAccounting: runBudget.snapshot(input.detail.summary.runId),
        providerCalls: providerCalls.calls,
        providerCallsOmitted: providerCalls.omitted,
        ...(grantSkip ? { patchSkipped: grantSkip } : plan.patchRequest.request ? {} : { patchSkipped: plan.patchRequest.reason }),
        ...(patchSkippedCode ? { patchSkippedCode } : {}),
        ...(declined ? { patchDeclined: declined.reason } : {}),
        ...(failureEvidence && result.intervention.contextSummary?.failureEvidence ? { failureEvidence: result.intervention.contextSummary.failureEvidence } : {}),
        ...(patchResult?.request.context.explorationEvidence ? { explorationEvidence: { carriedPackets: patchResult.request.context.explorationEvidence.packets.length, withheldPackets: patchResult.request.context.explorationEvidence.withheldPackets } } : {}),
        recoveryContext: summarizeAutomationStudioRuntimeRecoveryContext(recoveryContext), structuredDiagnosis: summarizeAutomationStudioRuntimeStructuredDiagnosis(plan.diagnosis) as unknown as JsonObject,
        diagnostics: [...result.diagnostics, ...(patchResult?.diagnostics ?? [])].map((diagnostic) => ({ code: diagnostic.code, severity: diagnostic.severity, message: diagnostic.message })),
        ...(reusableContextResult ? { reusableContext: reusableContextResult.metadata } : {})
      },
      ...(attempts.length ? { runtimePatchAttempts: attempts } : {}), recoveryTrace: automationStudioRuntimeRecoveryTrace({ invocation, policy: input.context.policy, plan, ...(exploration ? { exploration } : {}), diagnosisOk: result.ok, patchRequested: Boolean(patchResult), ...(patchFailureCode ? { patchFailureCode } : {}), ...(patchSkippedCode ? { patchSkippedCode } : {}), patchAttemptCount: attempts.length, adaptationIds: applied.adaptationIds, changeProposalIds: applied.changeProposalIds }) as unknown as JsonObject
    }
  };
  return {
    ...withIntervention,
    summary: flowRunSummaryWithInterventionSummaries(withIntervention)
  };
}

/**
 * Why a patch call is not worth making under a `diagnose_and_adapt` grant,
 * which buys one target override and nothing else.
 *
 * Two cases. The plan allows no target override at all for this failure -- a
 * guarded destination, a retired page, a record only a person can unlock -- so
 * the call could only return a substitute. Or the failure is a tie between
 * controls the page describes alike, which the matcher already read the page to
 * decide: a model shown the same page cannot break the tie, and under this
 * grant its only answer would be one of them. Both are refusals the run records
 * without paying for a call.
 */
function grantSkipReason(plan: { allowedPatchKinds: readonly string[]; diagnosis: { failureClass: string } }): string | undefined {
  if (!plan.allowedPatchKinds.includes("temporary_target_override")) {
    return `The diagnose_and_adapt grant buys only a target override, and the recovery plan allows none for a ${plan.diagnosis.failureClass.replace(/_/gu, " ")} failure, so no patch was requested.`;
  }
  if (plan.diagnosis.failureClass === "target_ambiguous") {
    return `The diagnose_and_adapt grant buys only a target override, and ${AUTOMATION_STUDIO_NO_REPAIR_REASONS.several_alike}, so no patch was requested.`;
  }
  return undefined;
}

/**
 * At most half of what a patch request may carry goes to explored packets.
 * The packet builder also holds them to the room the rest of the request left,
 * so this share bounds what exploring adds to a patch call's cost, not whether
 * the call fits.
 */
/**
 * A quarter of what a call may carry goes to the page the run failed on. At the
 * default 8,000-token input allowance that is Core's whole 6,000-byte ceiling,
 * which is the point: a repair sees what authoring sees. A smaller allowance
 * scales it down rather than overshooting the gate.
 */
const FAILURE_EVIDENCE_INPUT_SHARE = 0.25;
const EXPLORATION_EVIDENCE_INPUT_SHARE = 0.375;

/** A configured string, or the fallback when the setting is absent or blank. */
function settingString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
