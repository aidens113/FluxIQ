import type { AutomationStudioLlmTaskRequest } from "../harness/index.ts";
import { automationStudioLlmRequestDecisionTools, type AutomationStudioLlmDecisionTools } from "../provider-task/index.ts";

/**
 * The decision tools an evidence decision is sent as (D12, t1038), or `undefined` where its answer stays a JSON object:
 * any other task, a schema the tools cannot express, or `enabled: false` (the provider's `decisionTools: false`).
 * Both configured models take tools: every request is sent with thinking disabled, where `tool_choice: "required"`
 * is accepted (`../../models/providers/deepseek/decision-tools-wire.ts`).
 */
export function automationStudioDeepSeekDecisionTools(request: AutomationStudioLlmTaskRequest, enabled = true): AutomationStudioLlmDecisionTools | undefined {
  return enabled ? automationStudioLlmRequestDecisionTools(request) : undefined;
}
