import { isRecord } from "../provider-transport/index.ts";

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

/** Validate the unchanged original schema; the provider's relaxed grammar is never authority. */
export function automationStudioAnthropicMatchesSchema(value: unknown, schema: unknown, root = schema, depth = 0): boolean {
  if (depth > 96 || schema === false) return false;
  if (schema === true || !isRecord(schema)) return true;
  const fits = (child: unknown, current = value) => automationStudioAnthropicMatchesSchema(current, child, root, depth + 1);
  if (typeof schema.$ref === "string") {
    if (!schema.$ref.startsWith("#/")) return false;
    let referenced = root;
    for (const segment of schema.$ref.slice(2).split("/")) referenced = isRecord(referenced) ? referenced[segment.replace(/~1/g, "/").replace(/~0/g, "~")] : undefined;
    if (!referenced || !fits(referenced)) return false;
  }
  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) return false;
  if (Array.isArray(schema.enum) && !schema.enum.some((option) => JSON.stringify(value) === JSON.stringify(option))) return false;
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some((child) => fits(child))) return false;
  if (Array.isArray(schema.oneOf) && schema.oneOf.filter((child) => fits(child)).length !== 1) return false;
  if (Array.isArray(schema.allOf) && !schema.allOf.every((child) => fits(child))) return false;
  if (schema.not !== undefined && fits(schema.not)) return false;
  if (schema.if !== undefined && !fits(fits(schema.if) ? schema.then : schema.else)) return false;
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (types.length && !types.some((type) => matchesType(value, type))) return false;
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum || typeof schema.maximum === "number" && value > schema.maximum
      || typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum || typeof schema.exclusiveMaximum === "number" && value >= schema.exclusiveMaximum) return false;
    if (typeof schema.multipleOf === "number" && Math.abs(value / schema.multipleOf - Math.round(value / schema.multipleOf)) > 1e-9) return false;
  }
  if (typeof value === "string") {
    const length = [...value].length;
    if (typeof schema.minLength === "number" && length < schema.minLength || typeof schema.maxLength === "number" && length > schema.maxLength) return false;
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value)) return false;
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems || typeof schema.maxItems === "number" && value.length > schema.maxItems) return false;
    if (schema.uniqueItems === true && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) return false;
    if (schema.items !== undefined && !value.every((item) => fits(schema.items, item))) return false;
  }
  if (isRecord(value)) {
    if (Array.isArray(schema.required) && schema.required.some((key) => typeof key !== "string" || !Object.hasOwn(value, key))) return false;
    if (typeof schema.minProperties === "number" && Object.keys(value).length < schema.minProperties || typeof schema.maxProperties === "number" && Object.keys(value).length > schema.maxProperties) return false;
    const properties = isRecord(schema.properties) ? schema.properties : {};
    for (const [key, item] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) { if (!fits(properties[key], item)) return false; }
      else if (schema.additionalProperties === false || isRecord(schema.additionalProperties) && !fits(schema.additionalProperties, item)) return false;
    }
  }
  return true;
}

function matchesType(value: unknown, type: unknown): boolean {
  if (type === "null") return value === null;
  if (type === "object") return isRecord(value);
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  return typeof value === type && (type !== "number" || Number.isFinite(value));
}
