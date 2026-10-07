import { randomUUID } from "node:crypto";
import { flowBootstrapEvidenceLoopFailure, flowBootstrapHarnessFailure, runAutomationStudioFlowCandidateAuthoringLoop, sanitizedBootstrapAccounting, type AutomationStudioBootstrapAccounting, type AutomationStudioFlowBootstrapFailureStage } from "../../flow-bootstrap/index.ts";
import { automationStudioLlmUnusableDecisionError, type AutomationStudioLlmHarnessInput, type AutomationStudioLlmTaskResult } from "../../llm/index.ts";
import { automationStudioActivityDecisionReason, observeAutomationStudioEvidenceLoop } from "../../activity/index.ts";
import type { AutomationStudioFlowCandidateDraftRecord, AutomationStudioFlowCandidateDraftStore } from "../candidate-drafts/index.ts";
import type { AutomationStudioInstructionAuthorityUsage } from "../index.ts";
import { AutomationStudioCandidateSource as Source } from "../candidate-drafts/index.ts";
import { automationStudioCandidateFingerprint as fingerprint } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioCandidateOriginalSourceBinding } from "../../flow-bootstrap/candidate/index.ts";

type AuthoringInput = Parameters<typeof runAutomationStudioFlowCandidateAuthoringLoop>[0];
type Decide = AuthoringInput["loop"]["decide"];

/** Discovery/submission ends in a durable unverified draft, never an adaptation. */
export async function generateAutomationStudioFlowCandidateDraft(input: {
  submission: AuthoringInput["submission"];
  loop: Omit<AuthoringInput["loop"], "decide">;
  harness: Omit<AutomationStudioLlmHarnessInput, "taskKind" | "expectedOutput" | "evidenceLoop" | "signal"> & { provider: NonNullable<AutomationStudioLlmHarnessInput["provider"]> };
  runHarness(request: AutomationStudioLlmHarnessInput): Promise<AutomationStudioLlmTaskResult>;
  wrapDecision(decide: Decide): Decide;
  beforeDecision(): void;
  progress(accounting: AutomationStudioBootstrapAccounting, stage: AutomationStudioFlowBootstrapFailureStage): void;
  ending(loop: Awaited<ReturnType<typeof runAutomationStudioFlowCandidateAuthoringLoop>>["loop"], accounting: AutomationStudioBootstrapAccounting): Error | undefined;
  authorityUsage: AutomationStudioInstructionAuthorityUsage;
  sourceInstructionIds: string[];
  baseSettingsRevision: number;
  currentBinding(): Promise<{ executionDigest: string; settingsRevision: number }>;
  store: Pick<AutomationStudioFlowCandidateDraftStore, "save">;
  originalSource?: AutomationStudioCandidateOriginalSourceBinding;
}): Promise<AutomationStudioFlowCandidateDraftRecord> {
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
  const accounted = (spent: typeof observedUsage) => sanitizedBootstrapAccounting({ requestId, estimatedInputTokens: estimatedInputTokens + input.authorityUsage.estimatedInputTokens,
    provider: input.harness.provider.metadata.provider, model: input.harness.provider.metadata.model,
    inputTokens: spent.inputTokens + input.authorityUsage.inputTokens, outputTokens: spent.outputTokens + input.authorityUsage.outputTokens,
    totalTokens: spent.totalTokens + input.authorityUsage.totalTokens, estimatedCostUsd: spent.estimatedCostUsd + input.authorityUsage.estimatedCostUsd });
  const authored = await runAutomationStudioFlowCandidateAuthoringLoop({
    submission: input.submission,
    loop: observeAutomationStudioEvidenceLoop({ ...input.loop, decide: input.wrapDecision(async ({ iteration, tools, evidence, decisionSchema, canComplete, signal }) => {
      input.beforeDecision();
      input.progress(accounted(observedUsage), "provider_request");
      const decision = await input.runHarness({
        ...input.harness, taskKind: "evidence_tool_decision", expectedOutput: "evidence_tool_decision",
        evidenceLoop: { iteration, tools, evidence: evidence.map(entry => ({ ...entry })), decisionSchema, completionSchema: { type: "object", properties: { revision: { type: "integer" }, digest: { type: "string" } }, required: ["revision", "digest"], additionalProperties: false }, canComplete },
        ...(signal ? { signal } : {})
      });
      estimatedInputTokens += decision.request.estimatedInputTokens;
      for (const key of ["inputTokens", "outputTokens", "totalTokens", "estimatedCostUsd"] as const) observedUsage[key] += decision.usage?.[key] ?? 0;
      input.progress(accounted(observedUsage), decision.ok ? "provider_output_validation" : "provider_request");
      if (!decision.ok || decision.response?.kind !== "evidence_tool_decision") throw automationStudioLlmUnusableDecisionError(decision) ?? flowBootstrapHarnessFailure(decision);
      return automationStudioActivityDecisionReason.attach({ ...decision.response.decision, ...(decision.usage ? { usage: decision.usage } : {}) }, decision.response.summary);
    }) })
  });
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
    candidateId: `candidate.${randomUUID()}`, projectId, flowId, sourceInstructionIds: [...sourceInstructionIds], instructionText,
    baseSettingsRevision, accounting, createdAt: Date.now() };
  const record: AutomationStudioFlowCandidateDraftRecord = originalSource
    ? { ...common, schemaVersion: 2, originalSources: originalSource.originalSources, originalInstructionsDigest: originalSource.originalInstructionsDigest,
        candidate: { ...authored.candidate, fingerprintVersion: "candidate.plan+original_sources.v2", originalInstructionsDigest: originalSource.originalInstructionsDigest } }
    : { ...common, schemaVersion: 1, candidate: authored.candidate };
  return await input.store.save(record, input.loop.signal);
}
