import { canonicalJson, jsonEqual, type DataOperator } from "@fluxiq/contracts/fluxnode";
import type { JsonValue } from "../../../../../core/index.ts";
import { isTruthy } from "./is-truthy.ts";

function number(value: JsonValue | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function order(left: JsonValue, right: JsonValue): number | null {
  if (typeof left === "number" && typeof right === "number") return left - right;
  if (typeof left === "string" && typeof right === "string") return left < right ? -1 : left > right ? 1 : 0;
  return null;
}

function toText(value: JsonValue): string {
  if (value === null) return "";
  return typeof value === "string" ? value : typeof value === "object" ? canonicalJson(value) : String(value);
}

function toNumber(value: JsonValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function arithmetic(op: "add" | "sub" | "mul" | "div", args: JsonValue[]): JsonValue {
  const numbers = args.map(number);
  if (numbers.some((item) => item === null)) return null;
  const [first, ...rest] = numbers as number[];
  let result = first as number;
  for (const item of rest) {
    if (op === "div" && item === 0) return null;
    result = op === "add" ? result + item : op === "sub" ? result - item : op === "mul" ? result * item : result / item;
  }
  return Number.isFinite(result) ? result : null;
}

function round(args: JsonValue[]): JsonValue {
  const value = number(args[0]);
  const places = args[1] === undefined ? 0 : number(args[1]);
  if (value === null || places === null || !Number.isInteger(places) || places < 0 || places > 12) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function length(value: JsonValue): JsonValue {
  if (typeof value === "string") return [...value].length;
  if (Array.isArray(value)) return value.length;
  return typeof value === "object" && value !== null ? Object.keys(value).length : null;
}

function contains(left: JsonValue, right: JsonValue): boolean {
  if (typeof left === "string" && typeof right === "string") return left.includes(right);
  return Array.isArray(left) && left.some((item) => jsonEqual(item, right));
}

function compare(op: "lt" | "lte" | "gt" | "gte", left: JsonValue, right: JsonValue): boolean {
  const difference = order(left, right);
  if (difference === null) return false;
  return op === "lt" ? difference < 0 : op === "lte" ? difference <= 0 : op === "gt" ? difference > 0 : difference >= 0;
}

function bothText(left: JsonValue, right: JsonValue): left is string {
  return typeof left === "string" && typeof right === "string";
}

/** Applies an operator to arguments already evaluated. `evaluateExpression` evaluates `if` and `coalesce` lazily before it gets here. */
export function applyOperator(op: DataOperator, args: JsonValue[]): JsonValue {
  const [first, second] = args as [JsonValue, JsonValue];
  switch (op) {
    case "eq": return jsonEqual(first, second);
    case "ne": return !jsonEqual(first, second);
    case "lt": case "lte": case "gt": case "gte": return compare(op, first, second);
    case "in": return Array.isArray(second) && second.some((item) => jsonEqual(item, first));
    case "and": return args.every(isTruthy);
    case "or": return args.some(isTruthy);
    case "not": return !isTruthy(first);
    case "if": return isTruthy(first) ? second : (args[2] as JsonValue);
    case "coalesce": return args.find((item) => item !== null) ?? null;
    case "contains": return contains(first, second);
    case "starts_with": return bothText(first, second) && first.startsWith(second as string);
    case "ends_with": return bothText(first, second) && first.endsWith(second as string);
    case "concat": return args.map(toText).join("");
    case "lower": return typeof first === "string" ? first.toLowerCase() : null;
    case "upper": return typeof first === "string" ? first.toUpperCase() : null;
    case "trim": return typeof first === "string" ? first.trim() : null;
    case "add": case "sub": case "mul": case "div": return arithmetic(op, args);
    case "round": return round(args);
    case "to_number": return toNumber(first);
    case "to_text": return first === null ? null : toText(first);
    case "length": return length(first);
    case "exists": return first !== null;
  }
}
