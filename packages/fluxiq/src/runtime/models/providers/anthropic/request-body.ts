import { AUTOMATION_STUDIO_ANTHROPIC_MODEL_LIMITS, type AutomationStudioAnthropicModel } from "../../catalog/index.ts";
import type { AutomationStudioAnthropicOutputFormat } from "./schema.ts";

export const AUTOMATION_STUDIO_ANTHROPIC_JSON_TEXT_INSTRUCTION = "Transport encoding: put the complete JSON object requested by the preceding instructions and the user message's outputSchema into result_json as a JSON-serialized string in the outer response object. Apply every original requirement to the decoded object. Preserve all nested objects, parameter names and values. The outer response has only result_json.";

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
