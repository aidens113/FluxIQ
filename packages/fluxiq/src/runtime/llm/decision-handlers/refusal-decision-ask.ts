// A refused repeat asks the model to decide how to go on, as a steer does (`./model-decision.ts`,
// user 2026-11-19): the repeat guard's refusal names what was repeated, and this adds how often,
// what each came back with and the decision due, where the loop offers it.

import type { JsonObject } from "../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_LOOP_DECISION_TOOL_ID, automationStudioLlmLoopDecisionAsk } from "../loop-decision/index.ts";
import { AUTOMATION_STUDIO_LLM_LOOP_PATTERNS, type AutomationStudioLlmEvidenceRepeatedOutcome, type AutomationStudioLlmLoopFinding, type AutomationStudioLlmLoopPattern } from "../repeat-guard/index.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "./types.ts";

/**
 * A refused repeat's note, with the decision asked for where the model decides how to go on: what
 * was repeated, how often and what each came back with. The repeat is noted on the attempt's record,
 * so the decision knows what it is about. `note` as it was where no decision is offered.
 */
export function automationStudioLlmEvidenceRefusalDecisionAsk(context: AutomationStudioLlmEvidenceDecisionHandlerContext, note: JsonObject, toolId: string, earlier: AutomationStudioLlmEvidenceRepeatedOutcome, inARow: number): JsonObject {
  if (!context.toolIds.has(AUTOMATION_STUDIO_LLM_LOOP_DECISION_TOOL_ID)) return note;
  const pattern: AutomationStudioLlmLoopPattern = (AUTOMATION_STUDIO_LLM_LOOP_PATTERNS as readonly string[]).includes(earlier.outcome) ? earlier.outcome as AutomationStudioLlmLoopPattern : "exact_repeat";
  const finding: AutomationStudioLlmLoopFinding = { pattern, repeats: earlier.repeats ?? inARow + 1, toolIds: [toolId], unchanged: ["page"] };
  context.loops.record.noted(finding);
  const decide = automationStudioLlmLoopDecisionAsk(context.loops.cameBack(finding));
  return { ...note, instruction: `${String(note.instruction ?? "")} ${String(decide.instruction)}`.trim(), decide };
}
