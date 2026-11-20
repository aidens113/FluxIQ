// Where `core.loop_decision` is offered: a loop whose caller can act on what it raises
// (`loopSignal`, the attempt's rounds), since an `ask_person` is carried out there, and one that
// offers tools at all. Offered from the first decision, never added later: the tool list sits in
// the head of every request, and changing it mid-loop would send everything behind it again.

import type { AutomationStudioLlmEvidenceLoopInput } from "../loop-configuration.ts";
import { automationStudioLlmLoopDecisionTool } from "./tool.ts";
import { AUTOMATION_STUDIO_LLM_LOOP_DECISION_TOOL_ID } from "./tool-id.ts";

/** `input` with the decision offered after its own tools where it can be carried out; `input` itself otherwise. */
export function automationStudioLlmLoopDecisionOffered(input: AutomationStudioLlmEvidenceLoopInput): AutomationStudioLlmEvidenceLoopInput {
  if (!input.loopSignal || !Array.isArray(input.tools) || input.tools.length === 0) return input;
  if (input.tools.some((tool) => tool?.toolId === AUTOMATION_STUDIO_LLM_LOOP_DECISION_TOOL_ID)) return input;
  return { ...input, tools: [...input.tools, automationStudioLlmLoopDecisionTool()] };
}
