import type { ExecutableRouteConditionResult } from "../../../../flows/executable/routing/index.ts";

export function matchExecutableRoutePattern(value: unknown, expected: unknown, path: string): ExecutableRouteConditionResult {
  if (typeof expected !== "string") return { matched: false, reason: `${path} match expected value is not a pattern string.` };
  try {
    const matched = new RegExp(expected).test(String(value ?? ""));
    return { matched, reason: `${path} regex match evaluated.` };
  } catch {
    return { matched: false, reason: `${path} regex pattern is invalid.` };
  }
}
