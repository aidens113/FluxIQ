// A declared expression: how a filter decides, a transform builds a record, and a map
// step builds a Flow's inputs, without a model and without running code (plan, D2).
// It is JSON, so it can be stored, shown in the editor and checked before it runs.
// Evaluating it is the engine's job; this file only says what may be written.

import type { JsonValue } from "../../core.ts";
import { finishRawParse, zodFromParser, type FluxNodeIssuePath, type FluxNodeParseResult, type FluxNodeRawIssue } from "../issue/index.ts";
import { findNonJsonPart } from "../json/index.ts";
import { dataFieldPathSchema, type DataFieldPath } from "./field-path.ts";

/**
 * The operators and how many arguments each takes, as [least, most]:
 *
 * - compare: `eq`, `ne`, `lt`, `lte`, `gt`, `gte`; `in` (the first is in the second, a list);
 * - logic: `and`, `or`, `not`, `if` (condition, then, else), `coalesce` (the first that is not null);
 * - text: `contains`, `starts_with`, `ends_with`, `concat`, `lower`, `upper`, `trim`;
 * - numbers: `add`, `sub`, `mul`, `div`, `round` (a value, and optionally its decimal places);
 * - conversion and shape: `to_number`, `to_text`, `length`, `exists`.
 */
export const DATA_OPERATORS = Object.freeze({
  eq: [2, 2],
  ne: [2, 2],
  lt: [2, 2],
  lte: [2, 2],
  gt: [2, 2],
  gte: [2, 2],
  in: [2, 2],
  and: [1, 32],
  or: [1, 32],
  not: [1, 1],
  if: [3, 3],
  coalesce: [1, 32],
  contains: [2, 2],
  starts_with: [2, 2],
  ends_with: [2, 2],
  concat: [1, 32],
  lower: [1, 1],
  upper: [1, 1],
  trim: [1, 1],
  add: [2, 32],
  sub: [2, 2],
  mul: [2, 32],
  div: [2, 2],
  round: [1, 2],
  to_number: [1, 1],
  to_text: [1, 1],
  length: [1, 1],
  exists: [1, 1]
} as const satisfies Record<string, readonly [number, number]>);

export type DataOperator = keyof typeof DATA_OPERATORS;

/**
 * One expression, an object with exactly one form:
 *
 * - `{ field }`: a value of the current record (`DataFieldPath`); missing is null;
 * - `{ input }`: a value of the pipeline's inputs;
 * - `{ value }`: a literal JSON value;
 * - `{ op, args }`: an operator (`DATA_OPERATORS`) over expressions;
 * - `{ object }`: a record built from named expressions;
 * - `{ list }`: a list built from expressions.
 */
export type DataExpression =
  | { field: DataFieldPath }
  | { input: DataFieldPath }
  | { value: JsonValue }
  | { op: DataOperator; args: DataExpression[] }
  | { object: { [key: string]: DataExpression } }
  | { list: DataExpression[] };

/** How deep expressions may nest and how many one may hold in all. */
export const DATA_EXPRESSION_LIMITS = Object.freeze({ maxDepth: 32, maxNodes: 2000, maxMembers: 256 });

type State = { issues: FluxNodeRawIssue[]; nodes: number };

/** Parses an untrusted value into an expression, or every reason it is not one. Codes are prefixed `expression.`. */
export function parseDataExpression(value: unknown): FluxNodeParseResult<DataExpression> {
  const issues: FluxNodeRawIssue[] = [];
  return finishRawParse(readDataExpression(value, issues), issues);
}

/** The parser over a raw issue list. */
export function readDataExpression(value: unknown, issues: FluxNodeRawIssue[]): DataExpression | null {
  const before = issues.length;
  const expression = read(value, [], 0, { issues, nodes: 0 });
  return issues.length === before ? expression : null;
}

/** An expression as a zod schema. */
export const dataExpressionSchema = zodFromParser(readDataExpression);

const FORMS = ["field", "input", "value", "op", "object", "list"] as const;

function add(state: State, path: FluxNodeIssuePath, code: string, message: string): null {
  state.issues.push({ path, code: `expression.${code}`, message });
  return null;
}

function isPlain(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function read(value: unknown, path: FluxNodeIssuePath, depth: number, state: State): DataExpression | null {
  state.nodes += 1;
  if (depth > DATA_EXPRESSION_LIMITS.maxDepth) return add(state, path, "too_deep", `Expressions nest more than ${DATA_EXPRESSION_LIMITS.maxDepth} deep here.`);
  if (state.nodes > DATA_EXPRESSION_LIMITS.maxNodes) return add(state, path, "too_large", `The expression holds more than ${DATA_EXPRESSION_LIMITS.maxNodes} parts.`);
  if (!isPlain(value)) return add(state, path, "not_object", 'An expression is an object such as { "field": "price" } or { "op": "gt", "args": [...] }.');
  const keys = Object.keys(value);
  const forms = FORMS.filter((form) => keys.includes(form));
  if (forms.length !== 1) return add(state, path, "bad_form", `An expression has exactly one of ${FORMS.join(", ")}; found ${forms.length === 0 ? "none" : forms.join(" and ")}.`);
  const form = forms[0] as (typeof FORMS)[number];
  const allowed = form === "op" ? ["op", "args"] : [form];
  const extra = keys.filter((key) => !allowed.includes(key));
  if (extra.length > 0) return add(state, [...path, extra[0] as string], "unknown_key", `"${extra[0]}" does not belong in a ${form} expression.`);
  const member = value[form];
  switch (form) {
    case "field":
    case "input": {
      const parsed = dataFieldPathSchema.safeParse(member);
      if (!parsed.success) return add(state, [...path, form], "bad_field", parsed.error.issues[0]?.message ?? "Not a field path.");
      return form === "field" ? { field: parsed.data } : { input: parsed.data };
    }
    case "value": {
      const at = findNonJsonPart(member);
      if (at !== null) return add(state, [...path, "value", ...at], "not_json", "A literal is a JSON value.");
      return { value: member as JsonValue };
    }
    case "op":
      return readOperator(member, value["args"], path, depth, state);
    case "object":
      return readObject(member, path, depth, state);
    case "list":
      return readList(member, path, depth, state);
  }
}

function readOperator(op: unknown, args: unknown, path: FluxNodeIssuePath, depth: number, state: State): DataExpression | null {
  if (typeof op !== "string" || !Object.hasOwn(DATA_OPERATORS, op)) return add(state, [...path, "op"], "unknown_operator", `${JSON.stringify(op)} is not an operator. Use one of ${Object.keys(DATA_OPERATORS).join(", ")}.`);
  const operator = op as DataOperator;
  const [least, most] = DATA_OPERATORS[operator];
  if (!Array.isArray(args) || args.length < least || args.length > most) {
    const wanted = least === most ? `${least}` : `${least} to ${most}`;
    return add(state, [...path, "args"], "arity", `"${operator}" takes ${wanted} argument${most === 1 ? "" : "s"} in args.`);
  }
  const parsed = args.map((arg, index) => read(arg, [...path, "args", index], depth + 1, state));
  if (parsed.some((arg) => arg === null)) return null;
  return { op: operator, args: parsed as DataExpression[] };
}

function readObject(member: unknown, path: FluxNodeIssuePath, depth: number, state: State): DataExpression | null {
  if (!isPlain(member) || Object.keys(member).length > DATA_EXPRESSION_LIMITS.maxMembers) return add(state, [...path, "object"], "bad_object", `object holds 0 to ${DATA_EXPRESSION_LIMITS.maxMembers} named expressions.`);
  const built: { [key: string]: DataExpression } = {};
  let failed = false;
  for (const key of Object.keys(member)) {
    const item = read(member[key], [...path, "object", key], depth + 1, state);
    if (item === null) failed = true;
    else Object.defineProperty(built, key, { value: item, enumerable: true, writable: true, configurable: true });
  }
  return failed ? null : { object: built };
}

function readList(member: unknown, path: FluxNodeIssuePath, depth: number, state: State): DataExpression | null {
  if (!Array.isArray(member) || member.length > DATA_EXPRESSION_LIMITS.maxMembers) return add(state, [...path, "list"], "bad_list", `list holds 0 to ${DATA_EXPRESSION_LIMITS.maxMembers} expressions.`);
  const items = member.map((item, index) => read(item, [...path, "list", index], depth + 1, state));
  return items.some((item) => item === null) ? null : { list: items as DataExpression[] };
}
