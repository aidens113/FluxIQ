// Reading a decision that lists several actions.
//
// The model's output has to be easy to produce, so this reads forgivingly and
// only what matters is required. The schema offers one shape,
// `{kind: "tool_calls", calls: [{toolId, input}, ...]}`, and this also takes
// the near misses a model writes on its way there: the list under `actions`,
// the singular `kind: "tool_call"` with a list, a `kind: "tool_calls"` naming
// one tool with no list, an action with no `input` (an empty one), and an
// action with no call id or an unusable one (the loop assigns its own). None
// of that can make anything executable that was not named: each action still
// names a tool the loop offered, and each tool still checks its own input.
//
// What it does not forgive is a key it does not know, at either level. That is
// the same rule the single-call shape is held to at the harness boundary, and
// the reason is the same: an unrecognised field is where something would ride
// in beside the answer.
//
// A single call, `{kind: "tool_call", callId, toolId, input}`, is not read
// here at all. It keeps its own strict reading, unchanged.

import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_MAX_ACTIONS_PER_DECISION } from "../../loop-limits/index.ts";

/** One action of a listed decision. A missing call id is the loop's to assign. */
export type AutomationStudioLlmEvidenceBatchCall = { callId?: string; toolId: string; input: JsonObject };

/** Far past any list a decision should carry: past it, the reply is not a list of actions but noise. */
const MAX_LISTED = 100;
const LIST_KEYS = ["calls", "actions"] as const;

/**
 * The actions a decision lists, in order; `undefined` when it lists none (it
 * is some other decision), `"malformed"` when it lists something unusable.
 */
export function readAutomationStudioLlmEvidenceBatch(value: Record<string, unknown>): AutomationStudioLlmEvidenceBatchCall[] | "malformed" | undefined {
  if (value.kind !== "tool_calls" && value.kind !== "tool_call") return undefined;
  const listKey = LIST_KEYS.find((key) => value[key] !== undefined);
  if (listKey === undefined) {
    // `tool_calls` naming one tool: one action. `tool_call` with no list is the
    // single-call shape, read strictly elsewhere.
    if (value.kind !== "tool_calls") return undefined;
    if (!onlyKeys(value, ["kind", "callId", "toolId", "input"])) return "malformed";
    const call = readCall(value);
    return call ? [call] : "malformed";
  }
  if (!onlyKeys(value, ["kind", listKey])) return "malformed";
  const listed = value[listKey];
  if (!Array.isArray(listed) || !listed.length || listed.length > MAX_LISTED) return "malformed";
  const calls: AutomationStudioLlmEvidenceBatchCall[] = [];
  for (const item of listed) {
    if (!isRecord(item) || !onlyKeys(item, ["callId", "toolId", "input"])) return "malformed";
    const call = readCall(item);
    if (!call) return "malformed";
    calls.push(call);
  }
  return calls;
}

/**
 * The actions of a list that run this turn, and how many listed past the
 * per-decision ceiling do not. A long list is cut, not refused: refusing it
 * would spend a paid call on nothing.
 */
export function automationStudioLlmEvidenceBatchPlanned<Call>(calls: readonly Call[]): { run: readonly Call[]; cut: number } {
  const run = calls.slice(0, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_MAX_ACTIONS_PER_DECISION);
  return { run, cut: calls.length - run.length };
}

function readCall(item: Record<string, unknown>): AutomationStudioLlmEvidenceBatchCall | undefined {
  if (typeof item.toolId !== "string" || !validRequestIdentity(item.toolId)) return undefined;
  const input = item.input === undefined ? {} : item.input;
  if (!isJsonObject(input)) return undefined;
  const callId = typeof item.callId === "string" && validRequestIdentity(item.callId) ? { callId: item.callId } : {};
  return { ...callId, toolId: item.toolId, input };
}

function validRequestIdentity(value: string): boolean {
  return /^[a-z0-9_.:-]{1,200}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && isJsonValue(value, 0);
}

function isJsonValue(value: unknown, depth: number): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object" || depth > 20) return false;
  if (Array.isArray(value)) return value.length <= 1_000 && value.every((item) => isJsonValue(item, depth + 1));
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= 1_000 && entries.every(([key, item]) => key.length <= 500 && isJsonValue(item, depth + 1));
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

