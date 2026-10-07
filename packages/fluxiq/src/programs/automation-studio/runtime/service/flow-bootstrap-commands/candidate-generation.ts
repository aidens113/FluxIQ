import { randomUUID } from "node:crypto";
import { flowBootstrapEvidenceLoopFailure, flowBootstrapHarnessFailure, runAutomationStudioFlowCandidateAuthoringLoop, sanitizedBootstrapAccounting } from "../../flow-bootstrap/index.ts";
import { automationStudioLlmUnusableDecisionError, type AutomationStudioLlmHarnessInput, type AutomationStudioLlmTaskResult } from "../../llm/index.ts";
import { automationStudioActivityDecisionReason } from "../../activity/index.ts";
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
  authorityUsage: AutomationStudioInstructionAuthorityUsage;
  sourceInstructionIds: string[];
  baseSettingsRevision: number;
  currentBinding(): Promise<{ executionDigest: string; settingsRevision: number }>;
  store: Pick<AutomationStudioFlowCandidateDraftStore, "save">;
}): Promise<AutomationStudioFlowCandidateDraftRecord> {
  let estimatedInputTokens = 0;
  const authored = await runAutomationStudioFlowCandidateAuthoringLoop({
    submission: input.submission,
    loop: { ...input.loop, decide: input.wrapDecision(async ({ iteration, tools, evidence, decisionSchema, canComplete, signal }) => {
      input.beforeDecision();
      const decision = await input.runHarness({
        ...input.harness, taskKind: "evidence_tool_decision", expectedOutput: "evidence_tool_decision",
        evidenceLoop: { iteration, tools, evidence: evidence.map(entry => ({ ...entry })), decisionSchema, completionSchema: { type: "object", properties: { revision: { type: "integer" }, digest: { type: "string" } }, required: ["revision", "digest"], additionalProperties: false }, canComplete },
        ...(signal ? { signal } : {})
      });
      estimatedInputTokens += decision.request.estimatedInputTokens;
      if (!decision.ok || decision.response?.kind !== "evidence_tool_decision") throw automationStudioLlmUnusableDecisionError(decision) ?? flowBootstrapHarnessFailure(decision);
      return automationStudioActivityDecisionReason.attach({ ...decision.response.decision, ...(decision.usage ? { usage: decision.usage } : {}) }, decision.response.summary);
    }) }
  });
  const usage = input.authorityUsage, spent = authored.loop.accounting;
  const accounting = sanitizedBootstrapAccounting({
    requestId: `candidate.${randomUUID()}`, estimatedInputTokens: estimatedInputTokens + usage.estimatedInputTokens,
    provider: input.harness.provider.metadata.provider, model: input.harness.provider.metadata.model,
    inputTokens: spent.inputTokens + usage.inputTokens, outputTokens: spent.outputTokens + usage.outputTokens,
    totalTokens: spent.totalTokens + usage.totalTokens, estimatedCostUsd: spent.estimatedCostUsd + usage.estimatedCostUsd
  });
  if (!authored.loop.ok) throw flowBootstrapEvidenceLoopFailure(authored.loop, accounting);
  if (!authored.candidate) throw new Error("FLOW_CANDIDATE_MISSING: No latest submitted candidate.");
  input.loop.signal?.throwIfAborted(); input.submission.signal?.throwIfAborted();
  const current = await input.currentBinding();
  if (current.executionDigest !== authored.candidate.baseDependencyDigest || current.settingsRevision !== input.baseSettingsRevision) throw new Error("FLOW_BOOTSTRAP_STALE: Flow or settings changed during candidate generation.");
  return await input.store.save({
    kind: "flow_candidate_draft", schemaVersion: 1, status: "draft", verification: "not_performed",
    candidateId: `candidate.${randomUUID()}`, projectId: input.submission.projectId, flowId: input.submission.flowId,
    sourceInstructionIds: [...input.sourceInstructionIds], instructionText: input.submission.instructionText ?? "",
    baseSettingsRevision: input.baseSettingsRevision, candidate: authored.candidate, accounting, createdAt: Date.now()
  }, input.loop.signal);
}
