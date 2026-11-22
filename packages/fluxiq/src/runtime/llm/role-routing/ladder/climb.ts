// Compatibility export for old callers. Automation tasks never escalate their starting model.
import type { AutomationStudioLlmModelEscalation, AutomationStudioLlmModelLadder } from "./state.ts";

export function automationStudioLlmModelLadderClimb(
  _ladder: AutomationStudioLlmModelLadder,
  _cause: Parameters<AutomationStudioLlmModelLadder["escalate"]>[0],
  _iteration: number,
  _env: Readonly<Record<string, string | undefined>> = process.env
): AutomationStudioLlmModelEscalation | undefined {
  return undefined;
}
