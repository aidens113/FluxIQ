import { automationStudioAnthropicMessageBody } from "../../../models/providers/anthropic/index.ts";
export { AUTOMATION_STUDIO_ANTHROPIC_JSON_TEXT_INSTRUCTION, automationStudioAnthropicMessageBody } from "../../../models/providers/anthropic/index.ts";
import { automationStudioAnthropicCacheContent } from "./cache-content.ts";
import type { AutomationStudioLlmTaskRequest } from "../harness.ts";
import { estimateAutomationStudioLlmTokensFromUtf8Bytes } from "../token-estimation.ts";
import { automationStudioLlmTaskMessages, automationStudioLlmTaskOutputSchema } from "../provider-task/index.ts";
import type { AutomationStudioAnthropicModel } from "../models/index.ts";
import { automationStudioAnthropicOutputFormat, type AutomationStudioAnthropicOutputFormat } from "./schema.ts";

// Adapter framing only. The product's instructions and original outputSchema
// are unchanged; this names a reversible transport encoding, no task content.


export function automationStudioAnthropicRequest(request: AutomationStudioLlmTaskRequest, model: AutomationStudioAnthropicModel): { body: string; format: AutomationStudioAnthropicOutputFormat; estimatedInputBytes: number; estimatedInputTokens: number } {
  const [system, user] = automationStudioLlmTaskMessages(request);
  const format = automationStudioAnthropicOutputFormat(automationStudioLlmTaskOutputSchema(request));
  const wire = automationStudioAnthropicMessageBody({ model, system: system!.content, messages: [{ role: "user", content: automationStudioAnthropicCacheContent(user!.content, request.context.evidenceLoop?.evidence) }], format });
  // Includes the schema and adapter framing actually sent. Keys and framing
  // count too: this is conservative and agrees with the harness's preflight.
  const estimatedInputBytes = Buffer.byteLength(JSON.stringify({ system: wire.system, messages: wire.messages, output_config: wire.output_config }), "utf8");
  return { body: JSON.stringify(wire), format, estimatedInputBytes, estimatedInputTokens: estimateAutomationStudioLlmTokensFromUtf8Bytes(estimatedInputBytes) + 16 };
}
