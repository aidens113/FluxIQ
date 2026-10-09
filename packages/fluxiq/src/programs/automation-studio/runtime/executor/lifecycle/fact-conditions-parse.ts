// Reading fact conditions out of stored JSON (state-aware recovery plan, C9).
//
// This module owns the one parser for a `FactCondition[]` written in a graph:
// a handler's `when` and `completionCheck`, an entry's and a checkpoint's
// `when`, a Subflow's success check. A malformed condition is reported, never
// dropped silently, because a guard with a condition missing would pass where
// its author meant it to hold back.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_FACT_CONDITION_OPS, type AutomationStudioFactCondition, type AutomationStudioFactConditionOp, type AutomationStudioFactConditionValue } from "./fact-condition.ts";

const OPS: ReadonlySet<string> = new Set(AUTOMATION_STUDIO_FACT_CONDITION_OPS);

/** The conditions read, and a plain description of each one that could not be. */
export type AutomationStudioParsedFactConditions = {
  conditions: AutomationStudioFactCondition[];
  problems: string[];
};

/**
 * Reads a stored condition list. Absent reads as an empty list; anything that
 * is not an array, and any entry that is not a well-formed condition, is a
 * problem named by `path`.
 */
export function parseAutomationStudioFactConditions(value: JsonValue | undefined, path: string): AutomationStudioParsedFactConditions {
  if (value === undefined || value === null) return { conditions: [], problems: [] };
  if (!Array.isArray(value)) return { conditions: [], problems: [`${path} must be a list of fact conditions.`] };
  const conditions: AutomationStudioFactCondition[] = [];
  const problems: string[] = [];
  value.forEach((entry, index) => {
    const condition = factCondition(entry);
    if (condition) conditions.push(condition);
    else problems.push(`${path}.${index} is not a fact condition: it needs a non-empty "fact" and an "op" of ${AUTOMATION_STUDIO_FACT_CONDITION_OPS.join(", ")}.`);
  });
  return { conditions, problems };
}

function factCondition(entry: JsonValue): AutomationStudioFactCondition | undefined {
  if (!isObject(entry)) return undefined;
  const fact = typeof entry.fact === "string" ? entry.fact.trim() : "";
  const op = typeof entry.op === "string" && OPS.has(entry.op) ? (entry.op as AutomationStudioFactConditionOp) : undefined;
  if (!fact || !op) return undefined;
  const value = entry.value === undefined ? undefined : conditionValue(entry.value);
  if (entry.value !== undefined && value === undefined) return undefined;
  return {
    fact,
    op,
    ...(value !== undefined ? { value } : {}),
    ...(isObject(entry.target) ? { target: entry.target } : {})
  };
}

/** A literal, `{ input }` or `{ value }`; nothing for any other shape, which makes the condition malformed. */
function conditionValue(value: JsonValue): AutomationStudioFactConditionValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (isObject(value) && Object.keys(value).length === 1) {
    if (typeof value.input === "string") return { input: value.input };
    if (typeof value.value === "string") return { value: value.value };
  }
  return undefined;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
