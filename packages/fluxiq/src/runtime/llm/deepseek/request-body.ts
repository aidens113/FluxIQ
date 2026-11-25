import { automationStudioLlmTaskMessages as automationStudioDeepSeekMessages, type AutomationStudioLlmTaskMessage as AutomationStudioDeepSeekMessage } from "../provider-task/index.ts";
export { automationStudioLlmTaskMessages as automationStudioDeepSeekMessages, type AutomationStudioLlmTaskMessage as AutomationStudioDeepSeekMessage } from "../provider-task/index.ts";
import type { AutomationStudioLlmTaskRequest } from "../harness/index.ts";
import type { AutomationStudioLlmDecisionTools } from "../provider-task/index.ts";
import { automationStudioDeepSeekDecisionToolsWire } from "../../models/providers/deepseek/index.ts";
import { estimateAutomationStudioLlmTokensFromUtf8Bytes } from "../../models/limits/index.ts";
import { AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL, type AutomationStudioDeepSeekModel } from "./models.ts";

const AUTOMATION_STUDIO_DEEPSEEK_CHAT_FRAMING_TOKEN_RESERVE = 16;

/** One chat message on its way out: a role and the text under it. */


/** What a request will cost in input tokens, measured on the messages it will send. */
export function estimateAutomationStudioDeepSeekInputTokens(
  request: AutomationStudioLlmTaskRequest,
  _model: AutomationStudioDeepSeekModel = AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL
): number {
  return measureAutomationStudioDeepSeekInput(request).estimatedInputTokens;
}

/**
 * The messages a request will send, measured: their UTF-8 bytes and the input
 * tokens Core's one estimator puts them at. The harness reads this through the
 * provider's `measureInput` so its own size-carrying refusal and the adapter's
 * check can never disagree (`../harness/run.ts`).
 */
export function measureAutomationStudioDeepSeekInput(request: AutomationStudioLlmTaskRequest, decisionTools?: AutomationStudioLlmDecisionTools): { estimatedInputTokens: number; estimatedInputBytes: number } {
  const messages = automationStudioDeepSeekMessages(request, decisionTools ? "decision_tools" : "json_object");
  // The tools and the tool choice are input too, and sit before the messages in the prompt.
  const toolBytes = decisionTools ? Buffer.byteLength(JSON.stringify(automationStudioDeepSeekDecisionToolsWire(decisionTools.tools)), "utf8") : 0;
  const estimatedInputBytes = toolBytes + messages.reduce((total, message) => total + Buffer.byteLength(message.content, "utf8"), 0);
  return {
    estimatedInputTokens: estimateAutomationStudioLlmTokensFromUtf8Bytes(estimatedInputBytes) + AUTOMATION_STUDIO_DEEPSEEK_CHAT_FRAMING_TOKEN_RESERVE,
    estimatedInputBytes
  };
}

/**
 * The whole outbound request, as the bytes that go on the wire.
 *
 * **No `max_tokens` (user, 2026-10-03, t254).** Every request used to send its
 * `tokenLimits.maxOutputTokens` as a reply cap -- 2,000 for a build decision and
 * a judge, 8,000 for the instruction reading and recovery. The user: "i never
 * told you to add any cap on output. Remove that". The provider's own maximum
 * applies; `maxOutputTokens` is only what the context-window refusal sets
 * aside for the reply (`../harness/token-limits.ts`).
 */
export function buildAutomationStudioDeepSeekRequestBody(
  request: AutomationStudioLlmTaskRequest,
  model: AutomationStudioDeepSeekModel,
  /**
   * Given, an evidence decision goes as one native tool call (D12, t1038): `tools` and `tool_choice` replace
   * `response_format` (the schema is in the tools), the user message carries no `outputSchema`, and its `context` is
   * byte-identical. The tools come before the messages, so what does not change leads the prompt. Absent, the
   * request asks for a JSON object as before.
   */
  decisionTools?: AutomationStudioLlmDecisionTools
): string {
  const messages = automationStudioDeepSeekMessages(request, decisionTools ? "decision_tools" : "json_object");
  return JSON.stringify({
    model,
    temperature: 0,
    thinking: { type: "disabled" },
    stream: false,
    ...(decisionTools ? automationStudioDeepSeekDecisionToolsWire(decisionTools.tools) : { response_format: { type: "json_object" } }),
    messages
  });
}

/** The reply format every request asks for, named once so the refusal record can state it. */
export const AUTOMATION_STUDIO_DEEPSEEK_RESPONSE_FORMAT = "json_object";

/** The reply format of a decision sent as tools, as the refusal record states it. */
export const AUTOMATION_STUDIO_DEEPSEEK_TOOL_RESPONSE_FORMAT = "tool_choice_required";

