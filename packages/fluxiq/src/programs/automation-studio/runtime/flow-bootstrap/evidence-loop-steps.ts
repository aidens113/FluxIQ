// One evidence-loop decision reduced to a step a reader may keep: the tool it
// called, whether that call's effect was applied, the code it came to, and the
// call's own accounting.
//
// It was written for a *refused* build's diagnostic, which is where the shape
// is declared, and that is the whole problem it now also solves. A build that
// failed published its decisions; a build that succeeded published counts and
// a sorted list of tool ids, so the successful builds we most want to study
// were the ones we could not see. Both readers now take the same steps from
// the same function, so a proposed build's trail and a refused build's read
// alike and can be compared.
//
// **A step used to throw away most of what the trace had already kept.** The
// sanitized trace retains `iteration`, `callId`, `evidenceBytes` and the
// provider's `usage` for every row, and this function kept three fields of it,
// so the published record of a failed build was 32 rows of a tool id and a
// code -- twenty of them the same code -- with no iteration to order them by
// and no tokens to say what any of it cost. Everything the trace keeps now
// travels but one: the call id stays behind, because it is the model's own
// string rather than Core's (see `callId` below), and `iteration` ties a step
// to its call without carrying anything the model wrote.
//
// Codes, identifiers, counts and numbers only. Nothing a tool returned and
// nothing the model wrote passes through here, which is what lets a step ride
// on an audit detail that no redaction rule covers.
import type { AutomationStudioLlmEvidenceLoopTrace, AutomationStudioLlmUsageSummary } from "../llm/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../loop-limits/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_DECISION_STEP_IDS } from "./decision-step-ids.ts";

/**
 * A trace row as a reader of the loop's record sees one: the loop's own row,
 * plus `at` -- the moment the row was recorded, in epoch milliseconds.
 *
 * `at` is declared here rather than on the loop's trace type because a
 * timestamp is a diagnostic, not part of how a build runs, and the loop's type
 * is the contract its own callers build against. It is optional the whole way
 * down: a row without one publishes no `at`, and a reader that has none falls
 * back to what it could always do -- infer the order from `iteration`.
 *
 * Why it exists at all: a failed build's 32 decisions arrived inside one
 * undivided 99,375 ms gap, so nothing said which decision the time went into.
 * A stall is a step that took most of a minute, and without a per-row moment
 * it cannot be told from thirty-two that each took three seconds.
 */
export type AutomationStudioFlowBootstrapEvidenceTraceRow = AutomationStudioLlmEvidenceLoopTrace & { at?: number };

/** One decision as a step: identifiers, counts, a boolean and a code, and nothing else. */
export type AutomationStudioFlowBootstrapEvidenceStep = {
  toolId: string;
  /**
   * The loop iteration that paid for this decision. `0` is the deterministic
   * first observation, which no provider call was made for. Optional only so
   * that a record written before this field existed still parses; every step
   * this module builds carries one.
   */
  iteration?: number;
  /**
   * The call this decision made, where it made one.
   *
   * **Nothing emits this yet, deliberately.** A call id is the model's own
   * string, kept verbatim (`runtime/llm/evidence-loop.ts`'s `unusedCallId`
   * returns what the decision asked for), so publishing one puts model-written
   * text into a record that carries codes and identifiers only -- which is
   * what `generation-failure.test.ts` has asserted since the record existed.
   * The field is declared and parsed so that a Core-minted call id can travel
   * the day the loop mints one, without the shape and its allow-list having to
   * move in lockstep again. Until then `iteration` is what ties a step to its
   * call.
   */
  callId?: string;
  effectApplied?: boolean;
  resultCode?: string;
  /** The bytes of evidence this call's result added to the loop's budget. */
  evidenceBytes?: number;
  /** When the row was recorded, in epoch milliseconds. Absent where the loop recorded no moment. */
  at?: number;
  /** What the provider reported for the call that made this decision. Absent where it reported nothing. */
  usage?: AutomationStudioLlmUsageSummary;
};

/** The shape a code must have to travel: no whitespace, so no sentence. */
const EVIDENCE_STEP_CODE = /^[a-z0-9_.:-]{1,100}$/i;
/** The usage figures a step carries, each a non-negative finite number and nothing else. */
const USAGE_FIELDS = ["inputTokens", "outputTokens", "totalTokens", "cacheHitInputTokens", "cacheMissInputTokens", "estimatedCostUsd"] as const;

/**
 * The trace as steps, in the loop's own order. A `tool_call` that named no
 * tool contributes nothing -- there is no step to name -- and every other
 * decision is named by Core's own `core.` step id, which no domain tool may
 * take, so a reader tells a decision from a tool call by its name alone.
 */
export function automationStudioFlowBootstrapEvidenceSteps(
  trace: readonly AutomationStudioFlowBootstrapEvidenceTraceRow[]
): AutomationStudioFlowBootstrapEvidenceStep[] {
  return trace.flatMap(automationStudioFlowBootstrapEvidenceStep);
}

function automationStudioFlowBootstrapEvidenceStep(entry: AutomationStudioFlowBootstrapEvidenceTraceRow): AutomationStudioFlowBootstrapEvidenceStep[] {
  const usage = stepUsage(entry.usage);
  const kept = {
    iteration: Number.isSafeInteger(entry.iteration) && entry.iteration >= 0 ? entry.iteration : 0,
    ...(entry.resultCode && EVIDENCE_STEP_CODE.test(entry.resultCode) ? { resultCode: entry.resultCode } : {}),
    ...(nonNegative(entry.evidenceBytes) ? { evidenceBytes: entry.evidenceBytes as number } : {}),
    ...(nonNegative(entry.at) ? { at: entry.at as number } : {}),
    ...(usage ? { usage } : {})
  };
  if (entry.decision === "tool_call") {
    return entry.toolId ? [{ toolId: entry.toolId, ...kept, ...(entry.effectApplied !== undefined ? { effectApplied: entry.effectApplied } : {}) }] : [];
  }
  return [{ toolId: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_DECISION_STEP_IDS[entry.decision], ...kept }];
}

/** The provider's figures, kept field by field so nothing but a number rides along. */
function stepUsage(usage: AutomationStudioLlmUsageSummary | undefined): AutomationStudioLlmUsageSummary | undefined {
  if (!usage) return undefined;
  const kept: AutomationStudioLlmUsageSummary = {};
  for (const field of USAGE_FIELDS) {
    const value = usage[field];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) kept[field] = value;
  }
  return Object.keys(kept).length ? kept : undefined;
}

function nonNegative(value: number | undefined): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** A step's `at` is a moment, bounded so a bad number cannot pass as one: 2100-01-01. */
const EVIDENCE_STEP_MAX_TIMESTAMP_MS = 4_102_444_800_000;
/** A tool id and a call id are identifiers; both are bounded and neither may hold whitespace. */
const EVIDENCE_STEP_ID = /^[a-z0-9_.:-]{1,200}$/i;
/**
 * Every field a published step may carry, which is every field
 * `AutomationStudioFlowBootstrapEvidenceStep` declares.
 *
 * **This list and that type must move together, and they live in one file so
 * that is one edit.** The parser below rejects a record carrying a field this
 * list does not name, and a rejected step returns `null` for the whole
 * diagnostic -- so a step that gains a field while the list does not does not
 * arrive short, it takes the build's named reason with it and leaves a generic
 * transport failure in its place. They were in two files, which is how a step
 * came to publish three of the eight fields the trace had already kept.
 */
const EVIDENCE_STEP_FIELDS: Array<keyof AutomationStudioFlowBootstrapEvidenceStep> = ["toolId", "iteration", "callId", "effectApplied", "resultCode", "evidenceBytes", "at", "usage"];
/** The provider's figures a step may carry, each bounded the way the build's accounting is. */
const EVIDENCE_STEP_USAGE_TOKEN_FIELDS = ["inputTokens", "outputTokens", "totalTokens", "cacheHitInputTokens", "cacheMissInputTokens"] as const;

/**
 * The steps of a published record, read back. `null` when any of them is not a
 * step, because a record Core did not write is not one to republish.
 */
export function parseAutomationStudioFlowBootstrapEvidenceSteps(value: readonly unknown[]): AutomationStudioFlowBootstrapEvidenceStep[] | null {
  const steps: AutomationStudioFlowBootstrapEvidenceStep[] = [];
  for (const step of value) {
    if (!isStepRecord(step) || !hasExactFields(step, EVIDENCE_STEP_FIELDS)
      || typeof step.toolId !== "string" || !EVIDENCE_STEP_ID.test(step.toolId)
      || (step.iteration !== undefined && !boundedInteger(step.iteration, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations))
      || (step.callId !== undefined && (typeof step.callId !== "string" || !EVIDENCE_STEP_ID.test(step.callId)))
      || (step.effectApplied !== undefined && typeof step.effectApplied !== "boolean")
      || (step.resultCode !== undefined && (typeof step.resultCode !== "string" || !EVIDENCE_STEP_CODE.test(step.resultCode)))
      || (step.evidenceBytes !== undefined && !boundedInteger(step.evidenceBytes, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxEvidenceBytes))
      || (step.at !== undefined && !boundedInteger(step.at, EVIDENCE_STEP_MAX_TIMESTAMP_MS))) return null;
    const usage = parseStepUsage(step.usage);
    if (step.usage !== undefined && !usage) return null;
    steps.push({
      toolId: step.toolId,
      ...(step.iteration !== undefined ? { iteration: step.iteration as number } : {}),
      ...(step.callId !== undefined ? { callId: step.callId as string } : {}),
      ...(step.effectApplied !== undefined ? { effectApplied: step.effectApplied } : {}),
      ...(step.resultCode !== undefined ? { resultCode: step.resultCode } : {}),
      ...(step.evidenceBytes !== undefined ? { evidenceBytes: step.evidenceBytes as number } : {}),
      ...(step.at !== undefined ? { at: step.at as number } : {}),
      ...(usage ? { usage } : {})
    });
  }
  return steps;
}

/**
 * What the provider reported for one decision's call: token counts and a cost,
 * each bounded, and nothing else. `null` for anything that is not that, so a
 * step cannot smuggle an unbounded object through on a field named `usage`.
 */
function parseStepUsage(value: unknown): AutomationStudioLlmUsageSummary | null {
  if (value === undefined) return null;
  if (!isStepRecord(value) || !hasExactFields(value, [...EVIDENCE_STEP_USAGE_TOKEN_FIELDS, "estimatedCostUsd"])) return null;
  for (const field of EVIDENCE_STEP_USAGE_TOKEN_FIELDS) {
    if (value[field] !== undefined && !boundedInteger(value[field], AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS)) return null;
  }
  if (value.estimatedCostUsd !== undefined && (typeof value.estimatedCostUsd !== "number" || !Number.isFinite(value.estimatedCostUsd) || value.estimatedCostUsd < 0 || value.estimatedCostUsd > 10)) return null;
  const usage: AutomationStudioLlmUsageSummary = {};
  for (const field of EVIDENCE_STEP_USAGE_TOKEN_FIELDS) {
    if (value[field] !== undefined) usage[field] = value[field] as number;
  }
  if (value.estimatedCostUsd !== undefined) usage.estimatedCostUsd = value.estimatedCostUsd;
  return usage;
}

function isStepRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactFields(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const fields = new Set(allowed);
  return Object.keys(value).every((key) => fields.has(key));
}

function boundedInteger(value: unknown, maximum: number): boolean {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= maximum;
}
