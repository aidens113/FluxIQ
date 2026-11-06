// Where a reply parts from the schema it was asked for, and why, by path and constraint alone.
//
// The JSON-text transport leaves the schema to Core: the provider sees one string, so a reply can be sound JSON and fit
// nothing. Refusing it with one code says nothing a retry can use, and a run records no message. So each miss names a path
// and a rule in the schema's own words. **Never a word of the value**: a rule states what the schema allows and a path is
// made of the schema's keys, or of a key the reply wrote only where that key has the shape of a name (`./schema.ts` is
// the same walk asked only whether anything missed, so the two cannot disagree).
//
// **`lengths: false`.** A length is a bound the model is told, not a reason to throw a paid answer away (`maxLength`,
// `minLength`, `maxItems`): where a reader reads what the bound was for, it is that reader's to read, and the caller says
// so. Every other constraint still counts.

import { isRecord } from "../../transport/index.ts";

export type AutomationStudioAnthropicSchemaMiss = { path: string; rule: string };
type Walk = { root: unknown; lengths: boolean };

const MOST_DEPTH = 96;
const ROOT_PATH = "response";
/** A key a reply wrote is said only where it has the shape of a name: it could hold anything. */
const NAME = /^[A-Za-z_$][\w$-]{0,40}$/u;
const MOST_OPTIONS_SAID = 8;

/** Every place `value` parts from `schema` (header), none where it fits. */
export function automationStudioAnthropicSchemaMisses(value: unknown, schema: unknown, options: { root?: unknown; depth?: number; lengths?: boolean } = {}): AutomationStudioAnthropicSchemaMiss[] {
  return walked(value, schema, ROOT_PATH, { root: options.root ?? schema, lengths: options.lengths ?? true }, options.depth ?? 0);
}

function walked(value: unknown, schema: unknown, path: string, walk: Walk, depth: number): AutomationStudioAnthropicSchemaMiss[] {
  const miss = (rule: string, at = path): AutomationStudioAnthropicSchemaMiss => ({ path: at, rule });
  if (depth > MOST_DEPTH || schema === false) return [miss("is not allowed here")];
  if (schema === true || !isRecord(schema)) return [];
  const fit = (child: unknown, current: unknown = value, at = path) => walked(current, child, at, walk, depth + 1);
  const misses: AutomationStudioAnthropicSchemaMiss[] = [];
  if (typeof schema.$ref === "string") {
    const referenced = referencedBy(schema.$ref, walk.root);
    if (!referenced) misses.push(miss("is not a shape the schema can name"));
    else misses.push(...fit(referenced));
  }
  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) misses.push(miss(`must be exactly ${JSON.stringify(schema.const)}`));
  if (Array.isArray(schema.enum) && !schema.enum.some((option) => JSON.stringify(value) === JSON.stringify(option))) misses.push(miss(`must be one of ${schema.enum.slice(0, MOST_OPTIONS_SAID).map((option) => JSON.stringify(option)).join(", ")}`));
  if (Array.isArray(schema.anyOf)) {
    const tried = schema.anyOf.map((child) => fit(child));
    if (!tried.some((found) => found.length === 0)) misses.push(...nearest(tried, path));
  }
  if (Array.isArray(schema.oneOf)) {
    const tried = schema.oneOf.map((child) => fit(child));
    const fitting = tried.filter((found) => found.length === 0).length;
    if (fitting > 1) misses.push(miss("fits more than one of the shapes it may take"));
    if (fitting === 0) misses.push(...nearest(tried, path));
  }
  if (Array.isArray(schema.allOf)) misses.push(...schema.allOf.flatMap((child) => fit(child)));
  if (schema.not !== undefined && fit(schema.not).length === 0) misses.push(miss("is a shape it must not be"));
  if (schema.if !== undefined) misses.push(...fit(fit(schema.if).length === 0 ? schema.then : schema.else));
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (types.length && !types.some((type) => matchesType(value, type))) misses.push(miss(`must be ${types.map(typeWords).join(" or ")}`));
  if (typeof value === "number") misses.push(...numberMisses(value, schema).map((rule) => miss(rule)));
  if (typeof value === "string") misses.push(...stringMisses(value, schema, walk).map((rule) => miss(rule)));
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) misses.push(miss(`must hold at least ${schema.minItems} items`));
    if (walk.lengths && typeof schema.maxItems === "number" && value.length > schema.maxItems) misses.push(miss(`must hold at most ${schema.maxItems} items`));
    if (schema.uniqueItems === true && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) misses.push(miss("must hold no item twice"));
    if (schema.items !== undefined) value.forEach((item, index) => misses.push(...fit(schema.items, item, `${path}[${index}]`)));
  }
  if (isRecord(value)) misses.push(...objectMisses(value, schema, path, fit, miss));
  return misses;
}

/** The misses of the shape a reply came nearest: not one whose own word it wrote differently, then the fewest. */
function nearest(tried: readonly AutomationStudioAnthropicSchemaMiss[][], path: string): AutomationStudioAnthropicSchemaMiss[] {
  const wrongWord = (found: readonly AutomationStudioAnthropicSchemaMiss[]) => found.some((one) => one.rule.startsWith("must be exactly") && one.path.startsWith(`${path}.`) && !one.path.slice(path.length + 1).includes("."));
  return [...tried].sort((one, other) => Number(wrongWord(one)) - Number(wrongWord(other)) || one.length - other.length)[0] ?? [{ path, rule: "fits none of the shapes it may take" }];
}

function referencedBy(reference: string, root: unknown): unknown {
  if (!reference.startsWith("#/")) return undefined;
  let found = root;
  for (const segment of reference.slice(2).split("/")) found = isRecord(found) ? found[segment.replace(/~1/g, "/").replace(/~0/g, "~")] : undefined;
  return found;
}

function numberMisses(value: number, schema: Record<string, unknown>): string[] {
  const rules: string[] = [];
  if (typeof schema.minimum === "number" && value < schema.minimum) rules.push(`must be at least ${schema.minimum}`);
  if (typeof schema.maximum === "number" && value > schema.maximum) rules.push(`must be at most ${schema.maximum}`);
  if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum) rules.push(`must be more than ${schema.exclusiveMinimum}`);
  if (typeof schema.exclusiveMaximum === "number" && value >= schema.exclusiveMaximum) rules.push(`must be less than ${schema.exclusiveMaximum}`);
  if (typeof schema.multipleOf === "number" && Math.abs(value / schema.multipleOf - Math.round(value / schema.multipleOf)) > 1e-9) rules.push(`must be a multiple of ${schema.multipleOf}`);
  return rules;
}

function stringMisses(value: string, schema: Record<string, unknown>, walk: Walk): string[] {
  const rules: string[] = [];
  const length = [...value].length;
  if (walk.lengths && typeof schema.minLength === "number" && length < schema.minLength) rules.push(`must have at least ${schema.minLength} characters`);
  if (walk.lengths && typeof schema.maxLength === "number" && length > schema.maxLength) rules.push(`must have at most ${schema.maxLength} characters`);
  if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value)) rules.push("does not have the form the schema gives it");
  return rules;
}

function objectMisses(value: Record<string, unknown>, schema: Record<string, unknown>, path: string, fit: (child: unknown, current?: unknown, at?: string) => AutomationStudioAnthropicSchemaMiss[], miss: (rule: string, at?: string) => AutomationStudioAnthropicSchemaMiss): AutomationStudioAnthropicSchemaMiss[] {
  const misses: AutomationStudioAnthropicSchemaMiss[] = [];
  if (Array.isArray(schema.required)) {
    for (const key of schema.required) if (typeof key !== "string" || !Object.hasOwn(value, key)) misses.push(miss("is missing, and it must be there", `${path}.${typeof key === "string" ? key : "?"}`));
  }
  if (typeof schema.minProperties === "number" && Object.keys(value).length < schema.minProperties) misses.push(miss(`must hold at least ${schema.minProperties} keys`));
  if (typeof schema.maxProperties === "number" && Object.keys(value).length > schema.maxProperties) misses.push(miss(`must hold at most ${schema.maxProperties} keys`));
  const properties = isRecord(schema.properties) ? schema.properties : {};
  for (const [key, item] of Object.entries(value)) {
    const at = `${path}.${NAME.test(key) ? key : "?"}`;
    if (Object.hasOwn(properties, key)) misses.push(...fit(properties[key], item, at));
    else if (schema.additionalProperties === false) misses.push(miss("is not a key this object takes", at));
    else if (isRecord(schema.additionalProperties)) misses.push(...fit(schema.additionalProperties, item, at));
  }
  return misses;
}

const TYPE_WORDS: Readonly<Record<string, string>> = { null: "null", object: "an object", array: "a list", integer: "a whole number", number: "a number", string: "text", boolean: "true or false" };

function typeWords(type: unknown): string {
  return TYPE_WORDS[String(type)] ?? "another type";
}

function matchesType(value: unknown, type: unknown): boolean {
  if (type === "null") return value === null;
  if (type === "object") return isRecord(value);
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  return typeof value === type && (type !== "number" || Number.isFinite(value));
}
