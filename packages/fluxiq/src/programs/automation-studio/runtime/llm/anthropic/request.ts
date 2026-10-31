import { automationStudioAnthropicCacheContent } from "./cache-content.ts";
import type { AutomationStudioLlmTaskRequest } from "../harness.ts";
import { estimateAutomationStudioLlmTokensFromUtf8Bytes } from "../token-estimation.ts";
import { automationStudioLlmTaskMessages, automationStudioLlmTaskOutputSchema } from "../provider-task/index.ts";
import { AUTOMATION_STUDIO_ANTHROPIC_MODEL_LIMITS, type AutomationStudioAnthropicModel } from "../models/index.ts";
import { automationStudioAnthropicOutputFormat, type AutomationStudioAnthropicOutputFormat } from "./schema.ts";

// Adapter framing only. The product's instructions and original outputSchema
// are unchanged; this names a reversible transport encoding, no task content.
export const AUTOMATION_STUDIO_ANTHROPIC_JSON_TEXT_INSTRUCTION = "Transport encoding: put the complete JSON object requested by the preceding instructions and the user message's outputSchema into result_json as a JSON-serialized string in the outer response object. Apply every original requirement to the decoded object. Preserve all nested objects, parameter names and values. The outer response has only result_json.";

export function automationStudioAnthropicRequest(request: AutomationStudioLlmTaskRequest, model: AutomationStudioAnthropicModel): { body: string; format: AutomationStudioAnthropicOutputFormat; estimatedInputBytes: number; estimatedInputTokens: number } {
  const [system, user] = automationStudioLlmTaskMessages(request);
  const format = automationStudioAnthropicOutputFormat(automationStudioLlmTaskOutputSchema(request));
  const wire = automationStudioAnthropicMessageBody({ model, system: system!.content, messages: [{ role: "user", content: automationStudioAnthropicCacheContent(user!.content, request.context.evidenceLoop?.evidence) }], format });
  // Includes the schema and adapter framing actually sent. Keys and framing
  // count too: this is conservative and agrees with the harness's preflight.
  const estimatedInputBytes = Buffer.byteLength(JSON.stringify({ system: wire.system, messages: wire.messages, output_config: wire.output_config }), "utf8");
  return { body: JSON.stringify(wire), format, estimatedInputBytes, estimatedInputTokens: estimateAutomationStudioLlmTokensFromUtf8Bytes(estimatedInputBytes) + 16 };
}

export function automationStudioAnthropicMessageBody(input: { model: AutomationStudioAnthropicModel; system: string; messages: Array<{ role: "user" | "assistant"; content: string | Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> }>; format: AutomationStudioAnthropicOutputFormat }): Record<string, unknown> {
  return {
    model: input.model,
    max_tokens: AUTOMATION_STUDIO_ANTHROPIC_MODEL_LIMITS[input.model].maxOutputTokens,
    stream: true,
    // No sampling or disabled-thinking fields: current models reject them.
    system: [
      { type: "text", text: input.system, cache_control: { type: "ephemeral" } },
      ...(input.format.jsonText ? [{ type: "text", text: AUTOMATION_STUDIO_ANTHROPIC_JSON_TEXT_INSTRUCTION }] : [])
    ],
    messages: input.messages,
    // Automatic caching advances the breakpoint on successive requests.
    cache_control: { type: "ephemeral" },
    output_config: { format: { type: "json_schema", schema: input.format.schema } }
  };
}
