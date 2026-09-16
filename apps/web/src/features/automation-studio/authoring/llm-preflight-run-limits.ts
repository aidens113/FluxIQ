/**
 * What an LLM preflight answer says a whole request may spend, read without
 * trusting its shape.
 *
 * Core decides these for an iterating request the panel names no call count
 * for, so the panel has to take them from the answer rather than restate them:
 * `maxCalls` is Core's far-away backstop on provider calls, and
 * `maxTotalTokensPerRun` is the whole-run token budget the high-token
 * confirmation is judged on. `runTokenBudget` is `"unreadable"` when the answer
 * carries the field but not as a positive whole number, so a caller can fail
 * toward asking for confirmation instead of treating it as absent.
 *
 * Accepts either a preflight record or a response payload that wraps one as
 * `preflight`.
 */
export function llmPreflightRunLimits(value: unknown): {
  perCallTotalTokens?: number;
  maxCalls?: number;
  runTokenBudget?: number | "unreadable";
} | undefined {
  if (!isRecord(value)) return undefined;
  const preflight = isRecord(value.preflight) ? value.preflight : value;
  // Not held to finite: an unbounded per-call figure must still read as high.
  const perCallTotalTokens = isRecord(preflight.tokenLimits) ? positiveNumber(preflight.tokenLimits.maxTotalTokens) : undefined;
  const maxCalls = positiveFiniteNumber(preflight.maxCalls);
  const runTokenBudget = preflight.maxTotalTokensPerRun === undefined
    ? undefined
    : positiveSafeInteger(preflight.maxTotalTokensPerRun) ?? "unreadable";
  return {
    ...(perCallTotalTokens !== undefined ? { perCallTotalTokens } : {}),
    ...(maxCalls !== undefined ? { maxCalls } : {}),
    ...(runTokenBudget !== undefined ? { runTokenBudget } : {})
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && value > 0 ? value : undefined;
}

function positiveFiniteNumber(value: unknown): number | undefined {
  const number = positiveNumber(value);
  return number !== undefined && Number.isFinite(number) ? number : undefined;
}

function positiveSafeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
