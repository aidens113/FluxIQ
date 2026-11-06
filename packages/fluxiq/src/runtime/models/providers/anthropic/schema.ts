import { isRecord } from "../../transport/index.ts";
import { automationStudioAnthropicSchemaMisses } from "./schema-misses.ts";

const JSON_TEXT_SCHEMA = { type: "object", properties: { result_json: { type: "string", description: "The complete requested JSON object, serialized as JSON text." } }, required: ["result_json"], additionalProperties: false };
const CONSTRAINTS = new Set(["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "maxItems", "uniqueItems", "minProperties", "maxProperties", "pattern"]);
const FORMATS = new Set(["date-time", "time", "date", "duration", "email", "hostname", "uri", "ipv4", "ipv6", "uuid"]);
export type AutomationStudioAnthropicOutputFormat = { schema: Record<string, unknown>; jsonText: boolean };

/**
 * Native schemas must be closed and stay below Anthropic's grammar limits.
 * Arbitrary maps cannot be closed losslessly. Encode the whole original value
 * as JSON text in that case; only the transport changes, never the task schema.
 */
export function automationStudioAnthropicOutputFormat(original: Record<string, unknown> | undefined): AutomationStudioAnthropicOutputFormat {
  let optional = 0;
  let unions = 0;
  let representable = original?.type === "object";
  const visit = (value: unknown): unknown => {
    if (!isRecord(value)) {
      representable = false;
      return {};
    }
    const result: Record<string, unknown> = {};
    const notes: string[] = [];
    if (value.type === "object" || value.properties !== undefined) {
      if (value.additionalProperties !== false) representable = false;
      const required = Array.isArray(value.required) ? value.required : [];
      if (isRecord(value.properties)) optional += Object.keys(value.properties).filter((key) => !required.includes(key)).length;
    }
    if (value.anyOf || value.oneOf || Array.isArray(value.type)) unions += 1;
    for (const [key, item] of Object.entries(value)) {
      if (CONSTRAINTS.has(key) || (key === "minItems" && item !== 0 && item !== 1) || (key === "format" && !FORMATS.has(String(item)))) {
        notes.push(`${key}: ${JSON.stringify(item)}`);
      } else if (["$ref", "$defs", "definitions", "not", "if", "then", "else", "patternProperties", "dependentRequired", "dependentSchemas", "contains", "prefixItems"].includes(key)) {
        representable = false;
      } else if (key === "properties" && isRecord(item)) result[key] = Object.fromEntries(Object.entries(item).map(([name, child]) => [name, visit(child)]));
      else if (["anyOf", "oneOf", "allOf"].includes(key) && Array.isArray(item)) result[key === "oneOf" ? "anyOf" : key] = item.map(visit);
      else if (key === "items") result.items = visit(item);
      else if (["type", "enum", "const", "required", "additionalProperties", "description", "title", "default", "minItems", "format"].includes(key)) result[key] = item;
      else if (key !== "$schema") representable = false;
    }
    if (notes.length) result.description = [result.description, `Original constraints: ${notes.join("; ")}.`].filter(Boolean).join(" ");
    return result;
  };
  const schema = original ? visit(original) as Record<string, unknown> : JSON_TEXT_SCHEMA;
  return representable && optional <= 24 && unions <= 16 ? { schema, jsonText: false } : { schema: JSON_TEXT_SCHEMA, jsonText: true };
}

/** Validate the unchanged original schema; the provider's relaxed grammar is never authority. The one walk says where it missed as well (`./schema-misses.ts`). */
export function automationStudioAnthropicMatchesSchema(value: unknown, schema: unknown, root = schema, depth = 0): boolean {
  return automationStudioAnthropicSchemaMisses(value, schema, { root, depth }).length === 0;
}
