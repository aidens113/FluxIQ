import { isRecord } from "../../transport/index.ts";

const CONSTRAINTS = new Set(["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "maxItems", "uniqueItems", "minProperties", "maxProperties", "pattern"]);
const FORMATS = new Set(["date-time", "time", "date", "duration", "email", "hostname", "uri", "ipv4", "ipv6", "uuid"]);
const UNREPRESENTABLE = new Set(["$ref", "$defs", "definitions", "not", "if", "then", "else", "patternProperties", "dependentRequired", "dependentSchemas", "contains", "prefixItems"]);
const KEPT = new Set(["type", "enum", "const", "required", "additionalProperties", "description", "title", "default", "minItems", "format"]);

/**
 * A JSON schema as Anthropic's grammar can hold it, and what it costs against the grammar's limits: the
 * structured-outputs page's 24 optional parameters and 16 union-typed parameters across every strict schema of a
 * request (`optional`, `unions`). `representable` is false where the schema holds anything the grammar cannot close
 * losslessly -- an object left open, a reference, a conditional -- or its root is no object. A constraint the grammar
 * does not enforce moves into the description as words (`Original constraints: ...`); Core checks every one against
 * the unchanged original schema on the way back.
 */
export type AutomationStudioAnthropicGrammar = { schema: Record<string, unknown>; representable: boolean; optional: number; unions: number };

/** The structured-outputs page's explicit limits, across every strict schema of one request: strict tools, optional parameters, union-typed parameters. */
export const AUTOMATION_STUDIO_ANTHROPIC_GRAMMAR_LIMITS = Object.freeze({ strictTools: 20, optional: 24, unions: 16 });

/**
 * An optional property that is an open object (`{ type: "object" }` and nothing more), such as a `metadata` bag Core strips
 * on the way in anyway. The grammar cannot close it, and carrying it would force the whole answer into JSON text, so the
 * Anthropic grammar leaves it out. The unchanged original schema still describes it to every other provider.
 */
function isOpenOptionalObject(parent: Record<string, unknown>, key: string): boolean {
  const child = isRecord(parent.properties) ? parent.properties[key] : undefined;
  const required = Array.isArray(parent.required) ? parent.required : [];
  return !required.includes(key) && isRecord(child) && child.type === "object" && child.properties === undefined && child.additionalProperties === undefined && Object.keys(child).length === 1;
}

/** `original` as the grammar holds it (header). */
export function automationStudioAnthropicGrammar(original: Record<string, unknown>, options: { keepOpenObjects?: boolean } = {}): AutomationStudioAnthropicGrammar {
  // A tool must be able to send every key its input takes, so where it asks, an open object is kept, and leaves the schema unrepresentable.
  const dropped = (parent: Record<string, unknown>, key: string) => options.keepOpenObjects !== true && isOpenOptionalObject(parent, key);
  let optional = 0;
  let unions = 0;
  let representable = original.type === "object";
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
      if (isRecord(value.properties)) optional += Object.keys(value.properties).filter((key) => !required.includes(key) && !dropped(value, key)).length;
    }
    if (value.anyOf || value.oneOf || Array.isArray(value.type)) unions += 1;
    for (const [key, item] of Object.entries(value)) {
      if (CONSTRAINTS.has(key) || (key === "minItems" && item !== 0 && item !== 1) || (key === "format" && !FORMATS.has(String(item)))) {
        notes.push(`${key}: ${JSON.stringify(item)}`);
      } else if (UNREPRESENTABLE.has(key)) {
        representable = false;
      } else if (key === "properties" && isRecord(item)) result[key] = Object.fromEntries(Object.entries(item).filter(([name]) => !dropped(value, name)).map(([name, child]) => [name, visit(child)]));
      else if (["anyOf", "oneOf", "allOf"].includes(key) && Array.isArray(item)) result[key === "oneOf" ? "anyOf" : key] = item.map(visit);
      else if (key === "items") result.items = visit(item);
      else if (KEPT.has(key)) result[key] = item;
      else if (key !== "$schema") representable = false;
    }
    if (notes.length) result.description = [result.description, `Original constraints: ${notes.join("; ")}.`].filter(Boolean).join(" ");
    return result;
  };
  const schema = visit(original) as Record<string, unknown>;
  return { schema, representable, optional, unions };
}
