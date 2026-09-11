import type { AutomationStudioFlowIntervention } from "../../../model/index.ts";
import type { AutomationStudioLlmDiagnostic } from "./diagnostic.ts";
import { failureEvidenceProvenance } from "./failure-evidence.ts";
import type { AutomationStudioLlmProviderMetadata, AutomationStudioLlmUsageSummary } from "./provider.ts";
import { summarizeAutomationStudioLlmResponse, type AutomationStudioLlmStructuredResponse } from "./structured-response.ts";
import { kindForLlmTask } from "./task-kind.ts";
import type { AutomationStudioLlmHarnessInput, AutomationStudioLlmTaskRequest } from "./task-request.ts";

export function interventionFromLlmResult(
  input: AutomationStudioLlmHarnessInput,
  request: AutomationStudioLlmTaskRequest,
  diagnostics: AutomationStudioLlmDiagnostic[],
  createdAt: number,
  response?: AutomationStudioLlmStructuredResponse,
  provider?: AutomationStudioLlmProviderMetadata,
  usage?: AutomationStudioLlmUsageSummary
): AutomationStudioFlowIntervention {
  return {
    schemaVersion: "0.1",
    interventionId: `intervention.${request.taskKind}.${input.runId ?? input.flowId}.${createdAt}`,
    runId: input.runId ?? "",
    flowId: input.flowId,
    projectId: input.projectId,
    kind: kindForLlmTask(request.taskKind),
    reason: response ? "The LLM provider returned a structured result." : (request.dryRun ? "Dry-run LLM intervention was recorded." : "LLM intervention was prepared."),
    promptVersion: request.promptVersion,
    ...(provider?.provider ? { provider: provider.provider } : {}),
    ...(provider?.model ? { model: provider.model } : {}),
    instructionIds: request.context.instructions.instructionIds,
    contextSummary: {
      taskKind: request.taskKind,
      promptVersion: request.promptVersion,
      instructionCount: request.context.instructions.instructionIds.length,
      recentActionCount: request.context.recentActions?.length ?? 0,
      subflowCount: request.context.subflows?.length ?? 0,
      dryRun: request.dryRun === true,
      ...(request.context.failureEvidence ? { failureEvidence: failureEvidenceProvenance(request.context.failureEvidence) } : {})
    },
    ...(response ? { structuredResult: summarizeAutomationStudioLlmResponse(response) } : {}),
    validation: {
      ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
      issues: diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
    },
    ...(usage ? { tokenUsage: usage } : {}),
    createdAt,
    metadata: {
      requestId: request.requestId,
      idempotencyKey: request.idempotencyKey,
      timeoutMs: request.timeoutMs,
      estimatedInputTokens: request.estimatedInputTokens,
      tokenLimits: request.tokenLimits,
      maxEstimatedCostUsd: request.maxEstimatedCostUsd,
      expectedOutput: request.expectedOutput,
      diagnosticCount: diagnostics.length
    }
  };
}
