import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioLlmDecisionContextSupersede } from "../decision-context/index.ts";
import type { AutomationStudioLlmEvidenceEntry } from "../context-window.ts";

/** Delivers already screened feedback; the caller owns its meaning, progress and ending. */
export function automationStudioLlmFailedDecisionFeedback(input: {
  iteration: number;
  toolId: string;
  feedback: JsonObject;
  evidence: AutomationStudioLlmEvidenceEntry[];
  accountEvidence(value: JsonValue): number;
}): void {
  input.accountEvidence(input.feedback);
  automationStudioLlmDecisionContextSupersede(input.evidence, input.toolId);
  input.evidence.push({ callId: `${input.toolId}.${input.iteration}`, toolId: input.toolId, value: input.feedback });
}
