import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_ACTIONS_PER_DECISION,
  AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS
} from "../../loop-limits/index.ts";

/** One action in a provider-authored ordered decision. Core assigns call IDs. */
export type AutomationStudioLlmEvidenceBatchCall = {
  toolId: string;
  input: JsonObject;
};

/** The sole canonical multi-action decision shape. */
export type AutomationStudioLlmEvidenceBatchDecision = {
  kind: "tool_calls";
  calls: AutomationStudioLlmEvidenceBatchCall[];
};

export type AutomationStudioLlmEvidenceBatchDecisionIssue = {
  reason: "disabled" | "invalid_limit" | "invalid_decision" | "invalid_count" | "invalid_call" | "ineligible_tool" | "invalid_input";
  index?: number;
  field?: "kind" | "calls" | "toolId" | "input";
};

export type AutomationStudioLlmEvidenceBatchDecisionParseResult =
  | { ok: true; decision: AutomationStudioLlmEvidenceBatchDecision }
  | { ok: false; issues: AutomationStudioLlmEvidenceBatchDecisionIssue[] };

export type AutomationStudioLlmEvidenceBatchDecisionParseOptions = {
  maxActionsPerDecision?: number;
  eligibleToolIds?: readonly string[];
  isInputValid?: (toolId: string, input: JsonObject) => boolean;
};

/**
 * Reads a complete ordered decision before any caller acts on it.
 *
 * The default deliberately rejects lists. An enabled caller supplies the exact
 * tools offered for that provider turn and, when it has a schema validator, a
 * pure input predicate. All calls are checked before a decision is returned,
 * so an invalid later item cannot leave an executable prefix behind.
 */
export function parseAutomationStudioLlmEvidenceBatchDecision(
  value: unknown,
  options: AutomationStudioLlmEvidenceBatchDecisionParseOptions = {}
): AutomationStudioLlmEvidenceBatchDecisionParseResult {
  const maxActions = options.maxActionsPerDecision
    ?? AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_ACTIONS_PER_DECISION;
  if (!Number.isInteger(maxActions) || maxActions < 1 || maxActions > AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxActionsPerDecision) {
    return { ok: false, issues: [{ reason: "invalid_limit" }] };
  }
  if (maxActions === 1) return { ok: false, issues: [{ reason: "disabled", field: "kind" }] };
  if (!isRecord(value) || !exactKeys(value, ["kind", "calls"]) || value.kind !== "tool_calls" || !Array.isArray(value.calls)) {
    return { ok: false, issues: [{ reason: "invalid_decision" }] };
  }
  if (value.calls.length < 2 || value.calls.length > maxActions) {
    return { ok: false, issues: [{ reason: "invalid_count", field: "calls" }] };
  }

  const eligible = options.eligibleToolIds === undefined ? undefined : new Set(options.eligibleToolIds);
  const calls: AutomationStudioLlmEvidenceBatchCall[] = [];
  const issues: AutomationStudioLlmEvidenceBatchDecisionIssue[] = [];
  for (const [index, call] of value.calls.entries()) {
    if (!isRecord(call) || !exactKeys(call, ["toolId", "input"])) {
      issues.push({ reason: "invalid_call", index });
      continue;
    }
    if (!validRequestIdentity(call.toolId as string)) {
      issues.push({ reason: "invalid_call", index, field: "toolId" });
      continue;
    }
    if (!isJsonObject(call.input)) {
      issues.push({ reason: "invalid_call", index, field: "input" });
      continue;
    }
    if (eligible && !eligible.has(call.toolId as string)) {
      issues.push({ reason: "ineligible_tool", index, field: "toolId" });
      continue;
    }
    if (options.isInputValid && !options.isInputValid(call.toolId as string, call.input)) {
      issues.push({ reason: "invalid_input", index, field: "input" });
      continue;
    }
    calls.push({ toolId: call.toolId as string, input: structuredClone(call.input) });
  }
  return issues.length ? { ok: false, issues } : { ok: true, decision: { kind: "tool_calls", calls } };
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validRequestIdentity(value: string | undefined): value is string {
  return typeof value === "string" && /^[a-z0-9_.:-]{1,200}$/i.test(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && isJsonValue(value);
}

function isJsonValue(value: unknown, seen = new Set<unknown>(), depth = 0): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object" || seen.has(value) || depth > 20) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.length <= 1_000 && value.every((item) => isJsonValue(item, seen, depth + 1));
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= 1_000 && entries.every(([key, item]) => key.length <= 500 && isJsonValue(item, seen, depth + 1));
}
