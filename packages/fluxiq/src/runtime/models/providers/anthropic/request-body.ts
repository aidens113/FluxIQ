import { AUTOMATION_STUDIO_ANTHROPIC_MODEL_LIMITS, type AutomationStudioAnthropicModel } from "../../catalog/index.ts";
import type { AutomationStudioAnthropicOutputFormat } from "./schema.ts";

export const AUTOMATION_STUDIO_ANTHROPIC_JSON_TEXT_INSTRUCTION = "Transport encoding: put the complete JSON object requested by the preceding instructions and the user message's outputSchema into result_json as a JSON-serialized string in the outer response object. Apply every original requirement to the decoded object. Preserve all nested objects, parameter names and values. The outer response has only result_json.";

export function automationStudioAnthropicMessageBody(input: {
  model: AutomationStudioAnthropicModel;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string | Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> }>;
  format: AutomationStudioAnthropicOutputFormat;
  /**
   * Have the API mark the last block itself. Only for a conversation that grows
   * turn by turn (the panel's chat), whose last block the next request sends
   * again. Everything else is one call, or an evidence decision whose markers are
   * placed by `./cache-content.ts`: there the last block is what changes, and an
   * automatic marker after it pays the write premium on bytes never read back.
   */
  markLastBlock?: boolean;
}): Record<string, unknown> {
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
    ...(input.markLastBlock ? { cache_control: { type: "ephemeral" } } : {}),
    output_config: { format: { type: "json_schema", schema: input.format.schema } }
  };
}
