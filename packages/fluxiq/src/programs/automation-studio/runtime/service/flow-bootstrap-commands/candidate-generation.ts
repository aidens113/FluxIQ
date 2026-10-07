import { randomUUID } from "node:crypto";
import { flowBootstrapEvidenceLoopFailure, flowBootstrapEvidenceUnusableDecisionFailure, flowBootstrapHarnessFailure, sanitizedBootstrapAccounting, type AutomationStudioBootstrapAccounting, type AutomationStudioFlowBootstrapFailureStage } from "../../flow-bootstrap/index.ts";
import { runAutomationStudioFlowCandidateAuthoringLoop } from "../../flow-bootstrap/candidate/index.ts";
import { automationStudioLlmUnusableDecisionError, type AutomationStudioLlmEvidenceLoopAccounting, type AutomationStudioLlmEvidenceLoopTrace, type AutomationStudioLlmHarnessInput, type AutomationStudioLlmTaskResult } from "../../llm/index.ts";
import { automationStudioActivityDecisionReason, observeAutomationStudioEvidenceLoop } from "../../activity/index.ts";
import type { AutomationStudioFlowCandidateDraftRecord, AutomationStudioFlowCandidateDraftStore } from "../candidate-drafts/index.ts";
import type { AutomationStudioInstructionAuthorityUsage } from "../index.ts";
import { AutomationStudioCandidateSource as Source } from "../candidate-drafts/index.ts";
import { automationStudioCandidateFingerprint as fingerprint } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioCandidateOriginalSourceBinding, AutomationStudioCandidateTrialPort, AutomationStudioCandidateTrialResult } from "../../flow-bootstrap/candidate/index.ts";
import { automationStudioFlowBootstrapUnusableDecisions } from "./unusable-decisions.ts";
import { automationStudioFlowBootstrapFailureWithSpend } from "./failure-spend.ts";

type AuthoringInput = Parameters<typeof runAutomationStudioFlowCandidateAuthoringLoop>[0];
type Decide = AuthoringInput["loop"]["decide"];

/**
 * Discovery/submission ends in a durable unverified draft, never an adaptation.
 * With a trial port (t340) the model can test its candidate and completes only
 * on a yes for its exact latest revision and digest; the draft is saved either
 * way, under the candidate id minted before the loop, and the standing verdict
 * is returned for the caller to promote or not. This never promotes.
 *
 * An unusable decision is refused and asked again under the bound the legacy
 * round shares (`./unusable-decisions.ts`, t354); a run of them ends the build
 * as an unusable answer, and every ending carries the build's spend
 * (`./failure-spend.ts`).
 */
export async function generateAutomationStudioFlowCandidateDraft(input: {
  submission: AuthoringInput["submission"];
  loop: Omit<AuthoringInput["loop"], "decide" | "unusableDecisions">;
  /** The build's guard on unusable decisions in a row, the one the legacy round is given (`../../loop-limits/flow-bootstrap-evidence-loop.ts`). */
  maxConsecutiveUnusableDecisions: number;
  harness: Omit<AutomationStudioLlmHarnessInput, "taskKind" | "expectedOutput" | "evidenceLoop" | "signal"> & { provider: NonNullable<AutomationStudioLlmHarnessInput["provider"]> };
  runHarness(request: AutomationStudioLlmHarnessInput): Promise<AutomationStudioLlmTaskResult>;
  wrapDecision(decide: Decide): Decide;
  beforeDecision(): void;
  progress(accounting: AutomationStudioBootstrapAccounting, stage: AutomationStudioFlowBootstrapFailureStage): void;
  /** The build's own ending (a permission ask, a person needed) for a loop that stopped or stalled, or `undefined`. */
  ending(progress: { trace: readonly AutomationStudioLlmEvidenceLoopTrace[]; accounting: Readonly<AutomationStudioLlmEvidenceLoopAccounting> }, accounting: AutomationStudioBootstrapAccounting): Error | undefined;
  authorityUsage: AutomationStudioInstructionAuthorityUsage;
  sourceInstructionIds: string[];
  baseSettingsRevision: number;
  currentBinding(): Promise<{ executionDigest: string; settingsRevision: number }>;
  store: Pick<AutomationStudioFlowCandidateDraftStore, "save">;
  originalSource?: AutomationStudioCandidateOriginalSourceBinding;
  /** The candidate's id, minted before the loop because every trial request names it. Required with `trial`. */
  candidateId?: string;
  /** The service's trial runner; absent, completion ends as an unverified draft as before. */
  trial?: AutomationStudioCandidateTrialPort;
  /** What the trials' judges have spent so far, counted into the build's accounting. */
  trialSpend?: () => { inputTokens: number; outputTokens: number; totalTokens: number; estimatedCostUsd: number };
}): Promise<{ record: AutomationStudioFlowCandidateDraftRecord; trial: AutomationStudioCandidateTrialResult | undefined }> {
  if (input.trial && (typeof input.candidateId !== "string" || !input.candidateId)) throw new Error("candidate.trial_candidate_id_required");
  const candidateId = input.candidateId ?? `candidate.${randomUUID()}`;
  const descriptor = Object.getOwnPropertyDescriptor(input, "originalSource");
  if (descriptor && (!Object.hasOwn(descriptor, "value") || descriptor.value === undefined)) throw new Error("candidate.original_binding_invalid");
  const originalSource = descriptor ? Source.validate(descriptor.value as AutomationStudioCandidateOriginalSourceBinding) : undefined;
  const projectId = input.submission.projectId, flowId = input.submission.flowId, instructionText = input.submission.instructionText ?? "";
  const sourceInstructionIds = originalSource ? fingerprint.snapshot(input.sourceInstructionIds) : structuredClone(input.sourceInstructionIds), baseSettingsRevision = input.baseSettingsRevision;
  if (originalSource) {
    const submittedDescriptor = Object.getOwnPropertyDescriptor(input.submission, "originalSource");
    if (!submittedDescriptor || !Object.hasOwn(submittedDescriptor, "value")) throw new Error("candidate.original_binding_invalid");
    const submitted = Source.validate(submittedDescriptor.value as AutomationStudioCandidateOriginalSourceBinding);
    if (originalSource.originalSources.projectId !== projectId || originalSource.originalSources.flowId !== flowId
      || submitted.originalInstructionsDigest !== originalSource.originalInstructionsDigest
      || JSON.stringify(sourceInstructionIds) !== JSON.stringify(originalSource.originalSources.effectiveInstructionIds) || instructionText !== Source.text(originalSource)) throw new Error("candidate.original_binding_mismatch");
    fingerprint.snapshot({ originalSources: originalSource.originalSources, instructionText });
  } else if (Object.hasOwn(input.submission, "originalSource")) throw new Error("candidate.original_binding_mismatch");
  let estimatedInputTokens = 0;
  const requestId = `candidate.${randomUUID()}`, observedUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
  // The trials' judges are provider calls of this build too, made outside the loop's own decisions.
  const accounted = (spent: typeof observedUsage) => { const judged = input.trialSpend?.() ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 }; return sanitizedBootstrapAccounting({ requestId, estimatedInputTokens: estimatedInputTokens + input.authorityUsage.estimatedInputTokens,
    provider: input.harness.provider.metadata.provider, model: input.harness.provider.metadata.model,
    inputTokens: spent.inputTokens + input.authorityUsage.inputTokens + judged.inputTokens, outputTokens: spent.outputTokens + input.authorityUsage.outputTokens + judged.outputTokens,
    totalTokens: spent.totalTokens + input.authorityUsage.totalTokens + judged.totalTokens, estimatedCostUsd: spent.estimatedCostUsd + input.authorityUsage.estimatedCostUsd + judged.estimatedCostUsd }); };
  // A run of unusable decisions ends as an unusable answer, staged and worded as legacy's ("the model's answer could not be used"), with the build's spend.
  const unusableDecisions = automationStudioFlowBootstrapUnusableDecisions({ maxConsecutiveUnusableDecisions: input.maxConsecutiveUnusableDecisions, maxIterations: input.loop.maxIterations,
    callerEnding: (progress) => input.ending(progress, accounted(progress.accounting)), stalled: (progress) => flowBootstrapEvidenceUnusableDecisionFailure(progress, accounted(progress.accounting)) });
  const authored = await runAutomationStudioFlowCandidateAuthoringLoop({
    submission: input.submission, ...(input.trial ? { trial: { candidateId, port: input.trial } } : {}),
    loop: observeAutomationStudioEvidenceLoop({ ...input.loop, unusableDecisions, decide: input.wrapDecision(async ({ iteration, tools, evidence, decisionSchema, canComplete, signal }) => {
      input.beforeDecision();
      input.progress(accounted(observedUsage), "provider_request");
      const decision = await input.runHarness({
        ...input.harness, taskKind: "evidence_tool_decision", expectedOutput: "evidence_tool_decision",
        evidenceLoop: { iteration, tools, evidence: evidence.map(entry => ({ ...entry })), decisionSchema, completionSchema: { type: "object", properties: { revision: { type: "integer" }, digest: { type: "string" } }, required: ["revision", "digest"], additionalProperties: false }, canComplete },
        ...(signal ? { signal } : {})
      });
      estimatedInputTokens += decision.request.estimatedInputTokens;
      for (const key of ["inputTokens", "outputTokens", "totalTokens", "estimatedCostUsd"] as const) observedUsage[key] += decision.usage?.[key] ?? 0;
      const unusable = decision.ok && decision.response?.kind === "evidence_tool_decision" ? undefined : automationStudioLlmUnusableDecisionError(decision);
      // A reply arrived, usable or not: a failure from here is about the answer, never "the model could not be reached" (round 3's C2).
      input.progress(accounted(observedUsage), decision.ok || (unusable !== undefined && !unusable.providerUnanswered) ? "provider_output_validation" : "provider_request");
      if (!decision.ok || decision.response?.kind !== "evidence_tool_decision") throw unusable ?? flowBootstrapHarnessFailure(decision);
      return automationStudioActivityDecisionReason.attach({ ...decision.response.decision, ...(decision.usage ? { usage: decision.usage } : {}) }, decision.response.summary);
    }) })
  }).catch((error: unknown) => { throw automationStudioFlowBootstrapFailureWithSpend(error, accounted(observedUsage)); }); // Whatever ended it, the failure says what the build spent (round 3's C3).
  const accounting = accounted(authored.loop.accounting);
  input.progress(accounting, "post_provider_validation");
  if (!authored.loop.ok) throw input.ending(authored.loop, accounting) ?? flowBootstrapEvidenceLoopFailure(authored.loop, accounting);
  if (!authored.candidate) throw new Error("FLOW_CANDIDATE_MISSING: No latest submitted candidate.");
  input.loop.signal?.throwIfAborted(); input.submission.signal?.throwIfAborted();
  const current = await input.currentBinding();
  if (current.executionDigest !== authored.candidate.baseDependencyDigest || current.settingsRevision !== baseSettingsRevision) throw new Error("FLOW_BOOTSTRAP_STALE: Flow or settings changed during candidate generation.");
  if (originalSource && (authored.candidate.fingerprintVersion !== "candidate.plan+original_sources.v2" || authored.candidate.originalInstructionsDigest !== originalSource.originalInstructionsDigest)) throw new Error("candidate.original_binding_mismatch");
  input.loop.signal?.throwIfAborted(); input.submission.signal?.throwIfAborted();
  input.progress(accounting, "persistence");
  const common = { kind: "flow_candidate_draft" as const, status: "draft" as const, verification: "not_performed" as const,
    candidateId, projectId, flowId, sourceInstructionIds: [...sourceInstructionIds], instructionText,
    baseSettingsRevision, accounting, createdAt: Date.now() };
  const record: AutomationStudioFlowCandidateDraftRecord = originalSource
    ? { ...common, schemaVersion: 2, originalSources: originalSource.originalSources, originalInstructionsDigest: originalSource.originalInstructionsDigest,
        candidate: { ...authored.candidate, fingerprintVersion: "candidate.plan+original_sources.v2", originalInstructionsDigest: originalSource.originalInstructionsDigest } }
    : { ...common, schemaVersion: 1, candidate: authored.candidate };
  return { record: await input.store.save(record, input.loop.signal), trial: authored.trial };
}
