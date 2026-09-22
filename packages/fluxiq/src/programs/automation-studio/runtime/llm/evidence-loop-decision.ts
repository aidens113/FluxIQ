// How the loop reads what a provider said, and writes what it may say.
//
// This is the loop's grammar, kept apart from the loop that runs on it. One
// module decides what shapes a decision may take, what a tool call's result
// has to look like to count as one, and whether a completion check answered in
// the vocabulary it was asked in; `evidence-loop.ts` decides what to do about
// each answer. The split is the reason a new decision kind is a change here
// and a case there, rather than one file that both defines the language and
// acts on it.
//
// Nothing in here reaches outside its argument. Every function is total: it
// answers with the value it could read, or with nothing, and never throws at a
// provider that replied badly -- the loop is what decides whether a reply it
// could not read ends the run or is fed back.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA, type AutomationStudioFlowDraftAmendment } from "../flow-draft/index.ts";
import type { AutomationStudioLlmUsageSummary } from "./harness.ts";
import type {
  AutomationStudioLlmEvidenceLoopDecision,
  AutomationStudioLlmEvidenceTool,
  AutomationStudioLlmEvidenceToolExecutionResult
} from "./evidence-loop.ts";

/** Provider-neutral decision policy for bounded evidence loops. Provider adapters
 * should include this policy in their structured-decision instruction.
 *
 * The last two sentences were added after a live creation campaign in which
 * every built Flow only read and none acted. The policy already said, rightly,
 * never to mutate merely to perform a step that belongs in the generated
 * result; nothing said the converse, that a refusal here is not a refusal
 * there. Offered only tools that decline to act, and refused when it asked one
 * to, the model read the whole exercise as "acting is unavailable" and wrote
 * the only shape it had seen accepted. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_INSTRUCTION = "Evidence entries are the current authoritative results of prior tool calls. Your goal is to produce the final structured result, not to execute the workflow that result describes. When the decision schema offers a complete variant, evaluate it first. Complete immediately once current evidence is sufficient to construct that result. Do not select a tool merely because one remains available. Use a tool only to resolve information still missing from the result; prefer observation over mutation. Use a mutating tool only when its state change is necessary to reveal otherwise unavailable evidence, such as moving to where that evidence is kept or revealing what is hidden. Never mutate merely to perform an eventual workflow step that belongs in the generated result, and never repeat a successful mutation merely to try another eventual-workflow value. Never repeat the same toolId with the same input. Repeating an observation with different parameters is not progress. Do not call a mutating tool merely to unlock another observation. Treat a recoverable tool result shaped like {ok:false,code:string} as feedback and choose a different evidence-gathering action or complete if enough evidence is already available. An entry whose toolId starts with core. is Core's answer to your previous decision, not a tool result: correct what it names, and when it names an earlier callId, use that entry instead of asking again. A tool that refused you, or was never offered, bounds only what you may do while gathering evidence, never what the result may contain: write the step you were not permitted to perform here into the result instead, from what you observed.";

/** How many steps one amendment decision may edit at once. */
const MAX_AMENDMENTS_PER_DECISION = 16;

export function automationStudioLlmEvidenceCanonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(automationStudioLlmEvidenceCanonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${automationStudioLlmEvidenceCanonicalJson(value[key] as JsonValue)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function automationStudioLlmEvidenceParseToolExecutionResult(
  value: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult,
  effect: AutomationStudioLlmEvidenceTool["effect"]
): { evidence: JsonValue; effectApplied: boolean; targetsUnchanged?: boolean; resultCode?: string } | undefined {
  if (isRecord(value) && value.kind === "llm_evidence_tool_execution") {
    if (!exactKeys(value, ["kind", "evidence", "effectApplied", "targetsUnchanged", "resultCode"]) || !isJsonValue(value.evidence) || typeof value.effectApplied !== "boolean"
      || (value.targetsUnchanged !== undefined && typeof value.targetsUnchanged !== "boolean")
      || (value.resultCode !== undefined && (typeof value.resultCode !== "string" || !/^[a-z0-9_.:-]{1,100}$/i.test(value.resultCode)))) return undefined;
    return { evidence: value.evidence, effectApplied: value.effectApplied, ...(value.targetsUnchanged === undefined ? {} : { targetsUnchanged: value.targetsUnchanged }), ...(value.resultCode ? { resultCode: value.resultCode } : {}) };
  }
  if (!isJsonValue(value)) return undefined;
  return { evidence: value, effectApplied: effect !== "mutate" };
}

/**
 * What a decision may be: complete, call one of the offered tools, or -- once
 * the draft has a step to amend -- edit the draft.
 *
 * `allowAmend` is separate from the tool list because amending is not a tool:
 * it costs a call and no side effect, it is offered only when there is
 * something to amend, and the loop withdraws it once a run has spent its
 * allowance of them, which no tool does.
 */
export function buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools: AutomationStudioLlmEvidenceTool[], completionSchema: JsonObject = { type: "object" }, allowComplete = true, allowAmend = false): JsonObject {
  return {
    oneOf: [
      ...(allowComplete ? [{
        type: "object", additionalProperties: false, required: ["kind", "result"],
        properties: { kind: { const: "complete" }, result: structuredClone(completionSchema) }
      }] : []),
      ...(allowAmend ? [{
        type: "object", additionalProperties: false, required: ["kind", "amendments"],
        properties: {
          kind: { const: "amend_draft" },
          amendments: { type: "array", minItems: 1, maxItems: MAX_AMENDMENTS_PER_DECISION, items: structuredClone(AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA) }
        }
      }] : []),
      ...tools.map((tool) => ({
        type: "object", additionalProperties: false, required: ["kind", "callId", "toolId", "input"],
        properties: {
          kind: { const: "tool_call" }, callId: { type: "string", pattern: "^[a-zA-Z0-9_.:-]{1,200}$" },
          toolId: { const: tool.toolId }, input: structuredClone(tool.inputSchema)
        }
      }))
    ]
  };
}

export function automationStudioLlmEvidenceParseDecision(value: unknown): AutomationStudioLlmEvidenceLoopDecision | undefined {
  if (!isRecord(value)) return undefined;
  if (value.kind === "complete" && exactKeys(value, ["kind", "result", "usage"]) && isJsonObject(value.result) && validUsage(value.usage)) {
    return { kind: "complete", result: value.result, ...(value.usage ? { usage: value.usage as AutomationStudioLlmUsageSummary } : {}) };
  }
  if (value.kind === "tool_call" && exactKeys(value, ["kind", "callId", "toolId", "input", "usage"])
    && validId(value.callId) && validId(value.toolId) && isJsonObject(value.input) && validUsage(value.usage)) {
    return { kind: "tool_call", callId: value.callId, toolId: value.toolId, input: value.input, ...(value.usage ? { usage: value.usage as AutomationStudioLlmUsageSummary } : {}) };
  }
  if (value.kind === "amend_draft" && exactKeys(value, ["kind", "amendments", "usage"]) && validUsage(value.usage)) {
    const amendments = readAmendments(value.amendments);
    if (amendments) return { kind: "amend_draft", amendments, ...(value.usage ? { usage: value.usage as AutomationStudioLlmUsageSummary } : {}) };
  }
  return undefined;
}

/**
 * The amendments a reply carried, or nothing when it carried none the loop
 * could read.
 *
 * An amendment that cannot be read is left out rather than refusing the whole
 * decision, because a reply that named four steps and mistyped one has still
 * said three things worth doing, and the draft it is shown next says plainly
 * which of them landed.
 */
function readAmendments(value: unknown): AutomationStudioFlowDraftAmendment[] | undefined {
  if (!Array.isArray(value) || !value.length || value.length > MAX_AMENDMENTS_PER_DECISION) return undefined;
  const read: AutomationStudioFlowDraftAmendment[] = [];
  for (const item of value) {
    if (!isRecord(item) || !exactKeys(item, ["step", "change", "settings"])) continue;
    if (!Number.isSafeInteger(item.step) || (item.step as number) < 1) continue;
    if (item.change !== "drop" && item.change !== "exploratory" && item.change !== "keep") continue;
    if (item.settings !== undefined && !isJsonObject(item.settings)) continue;
    read.push({ step: item.step as number, change: item.change, ...(item.settings ? { settings: item.settings } : {}) });
  }
  return read.length ? read : undefined;
}

/**
 * A check's answer, or `undefined` when it is not one. Issue codes are kept
 * only when they are codes; feedback only when it is bounded JSON.
 */
export function automationStudioLlmEvidenceParseCompletionCheck(value: unknown): { ok: true } | { ok: false; issueCodes: string[]; feedback: JsonObject } | undefined {
  if (!isRecord(value)) return undefined;
  if (value.ok === true && exactKeys(value, ["ok"])) return { ok: true };
  if (value.ok !== false || !exactKeys(value, ["ok", "issueCodes", "feedback"]) || !Array.isArray(value.issueCodes) || !isJsonObject(value.feedback)) return undefined;
  const issueCodes = value.issueCodes.filter((code): code is string => typeof code === "string" && /^[a-z0-9_.:-]{1,100}$/i.test(code));
  return { ok: false, issueCodes, feedback: structuredClone(value.feedback) };
}

export function automationStudioLlmEvidenceValidTools(tools: AutomationStudioLlmEvidenceTool[]): boolean {
  if (!Array.isArray(tools) || !tools.length || tools.length > 32) return false;
  const ids = new Set<string>();
  const structurallyValid = tools.every((tool) => validId(tool.toolId) && !ids.has(tool.toolId) && Boolean(ids.add(tool.toolId))
    && typeof tool.description === "string" && tool.description.length > 0 && tool.description.length <= 2_000 && isJsonObject(tool.inputSchema)
    && (tool.effect === undefined || tool.effect === "observe" || tool.effect === "mutate")
    && (tool.repeatPolicy === undefined || (tool.repeatPolicy === "after_mutation" && tool.effect === "observe"))
    && (tool.initialObservation === undefined || (tool.effect === "observe" && isJsonObject(tool.initialObservation) && exactKeys(tool.initialObservation, ["input"]) && isJsonObject(tool.initialObservation.input))));
  return structurallyValid
    && tools.filter((tool) => tool.initialObservation !== undefined).length <= 1
    && (!tools.some((tool) => tool.repeatPolicy === "after_mutation") || tools.some((tool) => tool.effect === "mutate"));
}

function validUsage(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value) || !exactKeys(value, ["inputTokens", "outputTokens", "totalTokens", "estimatedCostUsd"])) return false;
  return [value.inputTokens, value.outputTokens, value.totalTokens].every((item) => item === undefined || (Number.isSafeInteger(item) && (item as number) >= 0))
    && (value.estimatedCostUsd === undefined || (typeof value.estimatedCostUsd === "number" && Number.isFinite(value.estimatedCostUsd) && value.estimatedCostUsd >= 0));
}

function exactKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  const set = new Set(allowed);
  return Object.keys(value).every((key) => set.has(key));
}

function validId(value: unknown): value is string { return typeof value === "string" && /^[a-z0-9_.:-]{1,200}$/i.test(value); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function isJsonObject(value: unknown): value is JsonObject { return isRecord(value) && isJsonValue(value); }
function isJsonValue(value: unknown, seen = new Set<object>(), depth = 0): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object" || depth > 20 || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.length <= 1_000 && value.every((item) => isJsonValue(item, seen, depth + 1));
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= 1_000 && entries.every(([key, item]) => key.length <= 500 && isJsonValue(item, seen, depth + 1));
}