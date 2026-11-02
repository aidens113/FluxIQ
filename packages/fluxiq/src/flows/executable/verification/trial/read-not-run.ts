import type { TrialNotRunHistory } from "./not-run-history.ts";

/** Exact historical acceptance: an explicit empty list is distinct from absent/malformed. */
export function readTrialNotRun(value: unknown): TrialNotRunHistory[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value.filter(isTrialNotRunHistory);
  return entries.length === value.length ? entries : undefined;
}

function isTrialNotRunHistory(value: unknown): value is TrialNotRunHistory {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  const passes = entry.passes === "every" || (Array.isArray(entry.passes) && entry.passes.length > 0 && entry.passes.every((pass) => Number.isInteger(pass) && (pass as number) > 0));
  return typeof entry.nodeId === "string" && entry.nodeId.length > 0 && passes && (entry.reason === "guarded" || entry.reason === "unreached")
    && (entry.label === undefined || typeof entry.label === "string") && (entry.after === undefined || typeof entry.after === "string")
    && (entry.of === undefined || Number.isInteger(entry.of));
}
