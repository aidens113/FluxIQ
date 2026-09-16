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
  AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_ESTIMATED_COST_USD,
  AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST,
  AUTOMATION_STUDIO_LLM_DEFAULT_MAX_EXPLORATION_CALLS_PER_RUN,
  AUTOMATION_STUDIO_LLM_MAX_FAILURE_EVIDENCE_BYTES,
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
import type { AutomationStudioRuntimeExploration } from "../runtime-exploration.ts";
import { automationStudioRuntimeRecoveryTrace } from "../stages.ts";
import { summarizeAutomationStudioRuntimeStructuredDiagnosis } from "../structured-diagnosis.ts";
import { runAutomationStudioRecoveryExploration } from "./exploration.ts";
import { applyAutomationStudioRuntimeRecoveryPatches } from "./patches.ts";
import type { AutomationStudioRuntimeRecoveryPorts } from "./ports.ts";

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
  /** Provider calls a bounded exploration may make on this run, over and above
   * the diagnosis and the patch; absent means
   * `AUTOMATION_STUDIO_LLM_DEFAULT_MAX_EXPLORATION_CALLS_PER_RUN`. Its own
   * number rather than a wider `maxCallsPerRun`, so somebody who sets the
   * intervention limit to two still gets two diagnosis-and-patch calls from it. */
  explorationCallAllowance?: number | undefined;
};

/** Core's default per-run token pot, per call the run may make. It used to be
 * the literal 12_000 below, written when a run meant two calls, so 6_000 x 2 is
 * that number unchanged; sizing it per call gives an exploration's calls tokens
 * to spend without widening anything a person set, because
 * `settings.budgets.maxTokensPerRun` still binds exactly as written when it is. */
const AUTOMATION_STUDIO_RECOVERY_DEFAULT_TOKENS_PER_CALL = 6_000;

/** One failed run, taken through the loop's four stages at the failure entry point. */
export async function annotateAutomationStudioRunDetailWithRuntimeLlm(
  input: AutomationStudioRuntimeRecoveryAnnotationInput
): Promise<AutomationStudioFlowRunDetail> {
  const ports = input.ports;
  if (!input.context) return input.detail;
  if (input.detail.summary.status !== "failed") return input.detail;
  const explicitGrantBudget = input.executionGrant?.purpose === "diagnose_and_adapt" || input.executionGrant?.purpose === "diagnosis_only";
  if (!input.context.behavior.invokeLlm || (!explicitGrantBudget && !input.context.budgetDecision.ok)) {
    return {
      ...input.detail,
      metadata: {
        ...(input.detail.metadata ?? {}),
        llmGate: {
          invoked: false,
          reason: !input.context.behavior.invokeLlm ? "Current training mode or settings do not allow LLM intervention." : `Training budget exhausted: ${input.context.budgetDecision.exhausted.join(", ")}.`
        }
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
  if (!invocation.invoke) return { ...input.detail, metadata: { ...(input.detail.metadata ?? {}), llmGate: { invoked: false, reason: invocation.reason, requiredPriorAction: invocation.requiredPriorAction }, recoveryTrace: automationStudioRuntimeRecoveryTrace({ invocation, policy: input.context.policy }) as unknown as JsonObject } };
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
  const explicitCallLimit = input.executionGrant?.purpose === "diagnose_and_adapt"
    ? 2
    : input.executionGrant?.purpose === "diagnosis_only"
      ? 1
      : undefined;
  const configuredCallLimits = [input.context.policy.maxInterventionsPerRun, input.context.settings.budgets?.maxInterventionsPerRun, providerResolution?.maxCallsPerRun]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  const maxCallsPerRun = explicitCallLimit ?? Math.max(1, Math.trunc(configuredCallLimits.length ? Math.min(...configuredCallLimits) : 2));
  // The exploration's own call number, and the run's total. The second matters
  // as much as the first: the per-run token pot below is a multiple of "how many
  // calls may this run make", so a pot sized for the diagnosis and the patch
  // alone would refuse an exploration on tokens the instant the call allowance
  // stopped refusing it on calls, and the split would change nothing.
  const explorationCallAllowance = Math.max(1, Math.trunc(input.explorationCallAllowance ?? AUTOMATION_STUDIO_LLM_DEFAULT_MAX_EXPLORATION_CALLS_PER_RUN));
  const totalCallAllowance = maxCallsPerRun + explorationCallAllowance;
  const requestedTokenLimits = providerResolution?.tokenLimits;
  let failureEvidence: JsonObject | undefined;
  if (provider && failedAttempt && ports.llmEvidenceRuntime?.captureSanitizedFailureEvidence) {
    const resolvedTokenLimits = resolveAutomationStudioLlmTokenLimits(requestedTokenLimits).limits;
    const maxEvidenceBytes = Math.max(1, Math.min(
      AUTOMATION_STUDIO_LLM_MAX_FAILURE_EVIDENCE_BYTES,
      Math.floor(resolvedTokenLimits.maxInputTokens * 3 * 0.2)
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
  const requestedTotalTokensPerRun = (requestedTokenLimits?.maxTotalTokens ?? 10_000) * totalCallAllowance;
  const maxTotalTokensPerRun = Math.max(1, Math.trunc(Math.min(
    AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST * totalCallAllowance,
    explicitGrantBudget
      ? requestedTotalTokensPerRun
      : Math.min(input.context.settings.budgets?.maxTokensPerRun ?? AUTOMATION_STUDIO_RECOVERY_DEFAULT_TOKENS_PER_CALL * totalCallAllowance, requestedTotalTokensPerRun)
  )));
  const maxOutputTokensPerRun = Math.max(1, Math.trunc(Math.min(maxTotalTokensPerRun, (requestedTokenLimits?.maxOutputTokens ?? maxTotalTokensPerRun) * totalCallAllowance)));
  // The money ceiling does not move. It is still the per-call cost the provider
  // resolution allows times the *ordinary* call limit, and what changes is only
  // how that fixed purse is divided: one share per call the run may make, so an
  // exploration is paid for out of the same money rather than out of more of it.
  const requestedEstimatedCostUsdPerRun = providerResolution?.maxTotalEstimatedCostUsd ?? (providerResolution?.maxEstimatedCostUsd ?? 0.25) * maxCallsPerRun;
  const maxEstimatedCostUsdPerRun = explicitGrantBudget
    ? Math.min(AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_ESTIMATED_COST_USD, requestedEstimatedCostUsdPerRun)
    : Math.min(0.25, input.context.policy.maxEstimatedCostUsdPerRun ?? 0.25, requestedEstimatedCostUsdPerRun);
  const maxEstimatedCostUsdPerCall = maxEstimatedCostUsdPerRun / totalCallAllowance;
  const runBudget = new AutomationStudioLlmRunBudgetLedger({
    maxCallsPerRun,
    maxExplorationCallsPerRun: explorationCallAllowance,
    maxTotalTokensPerRun,
    maxOutputTokensPerRun,
    maxEstimatedCostUsdPerRun
  });
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
    metadata: {
      source: "runRuntimeSession",
      expectedOutput: "diagnosis",
      ...(input.executionGrant?.purpose === "diagnose_and_adapt" ? { executionPurpose: "diagnose_and_adapt" } : {})
    }
  });
  // Stage B: the plan decides whether a patch is asked for at all, from the structured diagnosis and the policy, with no provider call.
  const plan = planAutomationStudioRuntimeRecovery({ ...(invocation.diagnosis ? { deterministic: invocation.diagnosis } : {}), result, policy: input.context.policy });
  // Stage C. `explorationRequested` is the plan's word and this is the only
  // thing that acts on it; before this the flag was recorded and never read.
  let exploration: AutomationStudioRuntimeExploration | undefined;
  if (plan.explorationRequested && provider && ports.llmEvidenceRuntime) {
    const scope = await ports.flowScope(input.context.projectId, input.context.flowId);
    if (scope) {
      exploration = await runAutomationStudioRecoveryExploration({
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
        ...(failureEvidence ? { failureEvidence } : {}),
        ...(reusableContextResult?.packet ? { reusableContext: reusableContextResult.packet } : {}),
        runBudget,
        ...(requestedTokenLimits ? { tokenLimits: requestedTokenLimits } : {}),
        ...(providerResolution?.timeoutMs !== undefined ? { timeoutMs: providerResolution.timeoutMs } : {}),
        maxEstimatedCostUsd: maxEstimatedCostUsdPerCall,
        recoveryDeadline,
        ...(input.graphOptions?.signal ? { signal: input.graphOptions.signal } : {})
      });
    }
  }
  const patchResult = plan.patchRequest.request && provider && input.runtimeFlow && input.failedTraceAttempt && input.context.behavior.createAdaptations
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
      metadata: {
        source: "runRuntimeSession",
        expectedOutput: "runtime_patch",
        ...(input.executionGrant?.purpose === "diagnose_and_adapt" ? { executionPurpose: "diagnose_and_adapt" } : {})
      }
    })
    : null;
  const applied = patchResult?.response?.kind === "runtime_patch" && input.runtimeFlow && input.failedTraceAttempt
    ? await applyAutomationStudioRuntimeRecoveryPatches({
      ports,
      context: input.context,
      runId: input.detail.summary.runId,
      ...(input.subflowId ? { subflowId: input.subflowId } : {}),
      flow: input.runtimeFlow,
      failedAttempt: input.failedTraceAttempt,
      patches: patchResult.response.patches,
      explicitProposalGrant: input.executionGrant?.purpose === "diagnose_and_adapt",
      ...(failureEvidence ? { failureEvidence } : {}),
      ...(reusableContextResult ? { reusableContextMetadata: reusableContextResult.metadata } : {}),
      ...(input.authorizedExternalSideEffects !== undefined ? { authorizedExternalSideEffects: input.authorizedExternalSideEffects } : {}),
      ...(input.graphOptions ? { graphOptions: input.graphOptions } : {})
    })
    : { attempts: [], adaptationIds: [], changeProposalIds: [] };
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
        ...(plan.patchRequest.request ? {} : { patchSkipped: plan.patchRequest.reason }),
        ...(failureEvidence && result.intervention.contextSummary?.failureEvidence ? { failureEvidence: result.intervention.contextSummary.failureEvidence } : {}),
        recoveryContext: summarizeAutomationStudioRuntimeRecoveryContext(recoveryContext), structuredDiagnosis: summarizeAutomationStudioRuntimeStructuredDiagnosis(plan.diagnosis) as unknown as JsonObject,
        diagnostics: [...result.diagnostics, ...(patchResult?.diagnostics ?? [])].map((diagnostic) => ({ code: diagnostic.code, severity: diagnostic.severity, message: diagnostic.message })),
        ...(reusableContextResult ? { reusableContext: reusableContextResult.metadata } : {})
      },
      ...(applied.attempts.length ? { runtimePatchAttempts: applied.attempts } : {}), recoveryTrace: automationStudioRuntimeRecoveryTrace({ invocation, policy: input.context.policy, plan, ...(exploration ? { exploration } : {}), diagnosisOk: result.ok, patchRequested: Boolean(patchResult), patchAttemptCount: applied.attempts.length, adaptationIds: applied.adaptationIds, changeProposalIds: applied.changeProposalIds }) as unknown as JsonObject
    }
  };
  return {
    ...withIntervention,
    summary: flowRunSummaryWithInterventionSummaries(withIntervention)
  };
}

/** A configured string, or the fallback when the setting is absent or blank. */
function settingString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
