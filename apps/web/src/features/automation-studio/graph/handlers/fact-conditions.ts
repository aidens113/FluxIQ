// A stored fact-condition list read as Core reads it (state-aware recovery
// plan, C9): the editor's mirror of Core's
// `runtime/executor/lifecycle/fact-conditions-parse.ts`, which stays the
// authority. Absent reads as an empty list; a list with any entry that is not
// a well-formed condition reads as nothing, so a half-read declaration is left
// out of the views rather than shown as if it were whole.

import type { FlowFactCondition } from "./types";

const OPS: ReadonlySet<string> = new Set(["exists", "absent", "visible", "enabled", "equals", "contains", "matches", "count"]);

/** The conditions of a stored list, or `undefined` when it is not one. */
export function readFlowFactConditions(value: unknown): FlowFactCondition[] | undefined {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return undefined;
  const conditions: FlowFactCondition[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return undefined;
    const fact = typeof entry.fact === "string" ? entry.fact.trim() : "";
    const op = typeof entry.op === "string" && OPS.has(entry.op) ? entry.op : "";
    if (!fact || !op) return undefined;
    if (entry.value !== undefined && !conditionValue(entry.value)) return undefined;
    conditions.push({
      fact,
      op,
      ...(entry.value !== undefined ? { value: entry.value } : {}),
      ...(isRecord(entry.target) ? { target: entry.target } : {})
    });
  }
  return conditions;
}

/** A literal, `{ input }` or `{ value }`, as Core accepts a condition's value. */
function conditionValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (!isRecord(value) || Object.keys(value).length !== 1) return false;
  return typeof value.input === "string" || typeof value.value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
