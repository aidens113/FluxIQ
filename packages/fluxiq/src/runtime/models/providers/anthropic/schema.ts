import { automationStudioAnthropicGrammar, AUTOMATION_STUDIO_ANTHROPIC_GRAMMAR_LIMITS } from "./grammar.ts";
import { automationStudioAnthropicSchemaMisses } from "./schema-misses.ts";

const JSON_TEXT_SCHEMA = { type: "object", properties: { result_json: { type: "string", description: "The complete requested JSON object, serialized as JSON text." } }, required: ["result_json"], additionalProperties: false };
export type AutomationStudioAnthropicOutputFormat = { schema: Record<string, unknown>; jsonText: boolean };

/**
 * Native schemas must be closed and stay below Anthropic's grammar limits (`./grammar.ts`).
 * Arbitrary maps cannot be closed losslessly. Encode the whole original value
 * as JSON text in that case; only the transport changes, never the task schema.
 */
export function automationStudioAnthropicOutputFormat(original: Record<string, unknown> | undefined): AutomationStudioAnthropicOutputFormat {
  if (!original) return { schema: JSON_TEXT_SCHEMA, jsonText: true };
  const grammar = automationStudioAnthropicGrammar(original);
  return grammar.representable && grammar.optional <= AUTOMATION_STUDIO_ANTHROPIC_GRAMMAR_LIMITS.optional && grammar.unions <= AUTOMATION_STUDIO_ANTHROPIC_GRAMMAR_LIMITS.unions
    ? { schema: grammar.schema, jsonText: false }
    : { schema: JSON_TEXT_SCHEMA, jsonText: true };
}

/** Validate the unchanged original schema; the provider's relaxed grammar is never authority. The one walk says where it missed as well (`./schema-misses.ts`). */
export function automationStudioAnthropicMatchesSchema(value: unknown, schema: unknown, root = schema, depth = 0): boolean {
  return automationStudioAnthropicSchemaMisses(value, schema, { root, depth }).length === 0;
}
