import { randomUUID } from "node:crypto";
import { flowBootstrapEvidenceLoopFailure, flowBootstrapHarnessFailure, runAutomationStudioFlowCandidateAuthoringLoop, sanitizedBootstrapAccounting, type AutomationStudioBootstrapAccounting, type AutomationStudioFlowBootstrapFailureStage } from "../../flow-bootstrap/index.ts";
import { automationStudioLlmUnusableDecisionError, type AutomationStudioLlmHarnessInput, type AutomationStudioLlmTaskResult } from "../../llm/index.ts";
import { automationStudioActivityDecisionReason, observeAutomationStudioEvidenceLoop } from "../../activity/index.ts";
import type { AutomationStudioFlowCandidateDraftRecord, AutomationStudioFlowCandidateDraftStore } from "../candidate-drafts/index.ts";
import type { AutomationStudioInstructionAuthorityUsage } from "../index.ts";

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
}): Promise<AutomationStudioFlowCandidateDraftRecord> {
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
  if (current.executionDigest !== authored.candidate.baseDependencyDigest || current.settingsRevision !== input.baseSettingsRevision) throw new Error("FLOW_BOOTSTRAP_STALE: Flow or settings changed during candidate generation.");
  input.loop.signal?.throwIfAborted(); input.submission.signal?.throwIfAborted();
  input.progress(accounting, "persistence");
  return await input.store.save({
    kind: "flow_candidate_draft", schemaVersion: 1, status: "draft", verification: "not_performed",
    candidateId: `candidate.${randomUUID()}`, projectId: input.submission.projectId, flowId: input.submission.flowId,
    sourceInstructionIds: [...input.sourceInstructionIds], instructionText: input.submission.instructionText ?? "",
    baseSettingsRevision: input.baseSettingsRevision, candidate: authored.candidate, accounting, createdAt: Date.now()
  }, input.loop.signal);
}
