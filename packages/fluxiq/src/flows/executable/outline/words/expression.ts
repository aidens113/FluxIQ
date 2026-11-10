// A data step's expression (`@fluxiq/contracts/fluxnode`, `DataExpression`) in
// plain words: "price is at most 20 and title contains “lamp”".
import type { JsonValue } from "../../../../core/index.ts";
import { outlineFieldWords } from "./field.ts";
import { outlineValueWords } from "./value.ts";

const COMPARE: Readonly<Record<string, string>> = {
  eq: "is",
  ne: "is not",
  lt: "is less than",
  lte: "is at most",
  gt: "is more than",
  gte: "is at least",
  in: "is one of",
  contains: "contains",
  starts_with: "starts with",
  ends_with: "ends with"
};

/** The expression in words; "a worked-out value" for a form the words do not cover. */
export function outlineExpressionWords(expression: JsonValue | undefined, depth = 0): string {
  if (!expression || typeof expression !== "object" || Array.isArray(expression) || depth > 8) return "a worked-out value";
  if ("field" in expression) return outlineFieldWords(expression.field);
  if ("input" in expression && typeof expression.input === "string") return `{${expression.input}}`;
  if ("value" in expression) return outlineValueWords(expression.value);
  const args = Array.isArray(expression.args) ? expression.args : [];
  const op = typeof expression.op === "string" ? expression.op : "";
  const said = args.map((arg) => outlineExpressionWords(arg, depth + 1));
  if (COMPARE[op] && said.length === 2) return `${said[0]} ${COMPARE[op]} ${said[1]}`;
  if ((op === "and" || op === "or") && said.length) return said.join(` ${op} `);
  if (op === "not" && said.length === 1) return `not (${said[0]})`;
  if (op === "exists" && said.length === 1) return `${said[0]} has a value`;
  return "a worked-out value";
}
