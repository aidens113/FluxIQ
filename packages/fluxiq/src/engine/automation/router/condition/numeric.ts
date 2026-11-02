import type { ExecutableRouteConditionResult } from "../../../../flows/executable/routing/index.ts";

export function compareExecutableRouteNumbers(value: unknown, expected: unknown, compare: (left: number, right: number) => boolean, path: string, label: string): ExecutableRouteConditionResult {
  const left = Number(value);
  const right = Number(expected);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return { matched: false, reason: `${path} cannot be compared as a number.` };
  return { matched: compare(left, right), reason: `${path} is ${label} ${right}: ${compare(left, right)}.` };
}
