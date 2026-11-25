import { automationStudioAnthropicMessageBody } from "../../models/providers/anthropic/index.ts";
export { AUTOMATION_STUDIO_ANTHROPIC_JSON_TEXT_INSTRUCTION, automationStudioAnthropicMessageBody } from "../../models/providers/anthropic/index.ts";
import { automationStudioAnthropicCacheContent, automationStudioAnthropicDecisionToolsWire, automationStudioAnthropicTrailCacheContent } from "../../models/providers/anthropic/index.ts";
import type { AutomationStudioLlmTaskRequest } from "../harness/index.ts";
import { estimateAutomationStudioLlmTokensFromUtf8Bytes } from "../../models/limits/index.ts";
import { automationStudioLlmEvidenceEntryMoves } from "../evidence-moves/index.ts";
import { automationStudioLlmRequestDecisionTools, automationStudioLlmTaskMessages, automationStudioLlmTaskOutputSchema, type AutomationStudioLlmDecisionTools } from "../provider-task/index.ts";
import type { AutomationStudioAnthropicModel } from "../models/index.ts";
import { automationStudioAnthropicOutputFormat, type AutomationStudioAnthropicOutputFormat } from "../../models/providers/anthropic/index.ts";

// Adapter framing only. The product's instructions and original outputSchema
// are unchanged; this names a reversible transport encoding, no task content.

/**
 * A task's request as it is sent. `decisionTools` is set where an evidence decision goes as one native tool call
 * (D12, t1038: `../provider-task/decision-tools/`, `../../models/providers/anthropic/decision-tools-wire.ts`); its
 * `format` is then not sent, and every other task, or a decision whose schema the tools cannot express, keeps the
 * output format it had.
 */
export type AutomationStudioAnthropicPreparedRequest = {
  body: string;
  format: AutomationStudioAnthropicOutputFormat;
  decisionTools?: AutomationStudioLlmDecisionTools;
  estimatedInputBytes: number;
  estimatedInputTokens: number;
};

/** The request as sent (header). `options.decisionTools: false` sends an evidence decision in the JSON-text transport instead of as tools. */
export function automationStudioAnthropicRequest(request: AutomationStudioLlmTaskRequest, model: AutomationStudioAnthropicModel, options: { decisionTools?: boolean } = {}): AutomationStudioAnthropicPreparedRequest {
  const decisionTools = options.decisionTools === false ? undefined : automationStudioLlmRequestDecisionTools(request);
  const [system, user] = automationStudioLlmTaskMessages(request, decisionTools ? "decision_tools" : "json_object");
  const format = automationStudioAnthropicOutputFormat(automationStudioLlmTaskOutputSchema(request));
  // A decision's evidence, or a judge's trail (t965), is split so the next call reads what it sends again from cache.
  const content = request.context.evidenceLoop ? automationStudioAnthropicCacheContent(user!.content, automationStudioLlmEvidenceEntryMoves) : automationStudioAnthropicTrailCacheContent(user!.content) ?? user!.content;
  const messages = [{ role: "user" as const, content }];
  const wire = decisionTools
    ? automationStudioAnthropicMessageBody({ model, system: system!.content, messages, tools: automationStudioAnthropicDecisionToolsWire(decisionTools.tools) })
    : automationStudioAnthropicMessageBody({ model, system: system!.content, messages, format });
  // Includes the tools or the schema and adapter framing actually sent. Keys and framing
  // count too: this is conservative and agrees with the harness's preflight.
  const estimatedInputBytes = Buffer.byteLength(JSON.stringify({ tools: wire.tools, tool_choice: wire.tool_choice, system: wire.system, messages: wire.messages, output_config: wire.output_config }), "utf8");
  return { body: JSON.stringify(wire), format, ...(decisionTools ? { decisionTools } : {}), estimatedInputBytes, estimatedInputTokens: estimateAutomationStudioLlmTokensFromUtf8Bytes(estimatedInputBytes) + 16 };
}
