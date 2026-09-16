// `recoveryContext`: the one bounded, domain-neutral description of a runtime
// failure that the model is asked to repair.
//
// Core's harness packet has had slots for most of this since it was written,
// and the one runtime caller filled four of them -- instructions, recent
// actions, a 3,000-byte page snapshot, and the policy gates. Expected state,
// the before/after state diff, the failed target, the router and subflow the
// run was in, prior adaptations and the recording behind them never reached the
// model at all. So the model was asked to repair an automation while being told
// almost nothing about what actually happened.
//
// Four decisions shape this module.
//
// **Shapes and names, never values.** Every section carries identity --
// statuses, routes, output *ids*, effect *types*, node ids, adaptation ids --
// and never the values a run resolved. `transitionComparison.actual.outputs`
// and `attempt.inputs` hold live data of unknown sensitivity, so nothing here
// reads them; the persisted run record is preferred over the live trace
// wherever it carries the same fact, because the persisted copy has already
// been through `trace-withholding.ts`. The one exception is `expectedState`,
// which is authored Flow-document data: the user wrote it, it is already in the
// document the model is reasoning about, and without it "expected state" is not
// in the context at all.
//
// **The priority is fixed, and it is a list rather than a score.** A ranking
// computed per failure would make the context's shape depend on the failure,
// and two runs of the same Flow would hand the model different evidence for
// reasons no reader could reconstruct. `AUTOMATION_STUDIO_RECOVERY_CONTEXT_SECTIONS`
// is that list, most important first, and it is also the drop order read
// backwards.
//
// **An empty section and a dropped section are different facts.** This is the
// whole point of the `omitted` list. A context that had no state diff because
// the host captured none, and a context whose state diff the byte budget forced
// out, must not read alike -- to the model or to whoever reads the run a week
// later. So every section named in the list appears in exactly one of
// `included` or `omitted`, always, and an omission says which of the two it
// was. `included.length + omitted.length` is the section count, and a test
// holds that.
//
// **The bookkeeping is never the thing that gets dropped.** Trimming measures
// the whole object, including the `omitted` entries it is adding, so the
// budget covers the record of what was withheld rather than being overrun by
// it.
//
// Recent browser events are deliberately not here. Nothing in the system
// captures them, adding a capture means an extension change, and the Week 2
// plan (decision L11) makes that conditional on the dry-run diagnoses showing
// that the state diff is not enough. That evidence does not exist yet.

import { parseAutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowAdaptation, AutomationStudioFlowRunActionAttemptRecord, AutomationStudioFlowRunDetail } from "../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../executor.ts";

/**
 * Every section, most important first. The order is the contract: it is the
 * order a reader may assume, and reversed it is the order the byte budget drops
 * them in.
 *
 * `recent_nodes` overlaps the packet's own `recentActions`, deliberately. The
 * packet's list is the last twelve *attempts* with their statuses and failure
 * categories; this is the ordered chain of nodes that actually succeeded before
 * the failure, and it is here so that `recoveryContext` is readable on its own
 * by the recovery plan and by the adaptation that records it. It is next to
 * last in priority precisely because the packet already says most of it.
 */
export const AUTOMATION_STUDIO_RECOVERY_CONTEXT_SECTIONS = [
  "failure",
  "expected_transition",
  "actual_transition",
  "state_diff",
  "failed_target",
  "recovery_candidates",
  "subflow",
  "route_context",
  "known_adaptations",
  "recent_nodes",
  "recording_context"
] as const;

export type AutomationStudioRecoveryContextSection = typeof AUTOMATION_STUDIO_RECOVERY_CONTEXT_SECTIONS[number];

/**
 * Why a section is not in the context.
 *
 * `absent` means the run never produced it -- no state diff was captured, the
 * failure was not inside a subflow, no adaptation matched. `byte_budget` means
 * it existed, was built, and was dropped to fit. `withheld` means it existed
 * and did not pass the bound a domain-supplied value is held to, so Core
 * refused to carry it.
 *
 * Three reasons rather than one flag, because collapsing any two of them makes
 * a context that lost its evidence indistinguishable from one that never had
 * any -- which is the failure this whole record exists to prevent. In
 * particular a refusal must never read as an absence: "the host captured no
 * state diff" and "the state diff carried something Core will not pass on" are
 * different problems with different answers.
 */
export type AutomationStudioRecoveryContextOmissionReason = "absent" | "byte_budget" | "withheld";

export type AutomationStudioRecoveryContextOmission = {
  section: AutomationStudioRecoveryContextSection;
  reason: AutomationStudioRecoveryContextOmissionReason;
  /** What the section would have cost. Zero for `absent` and for `withheld`; the real serialized size for `byte_budget`. */
  byteCount: number;
};

export type AutomationStudioRuntimeRecoveryContext = {
  schemaVersion: "automation-studio.recovery-context.v1";
  /** Only the sections that made it. Keyed by section name so a reader never positionally indexes them. */
  sections: Partial<Record<AutomationStudioRecoveryContextSection, JsonObject>>;
  /** The included sections in priority order, with what each one costs. */
  included: Array<{ section: AutomationStudioRecoveryContextSection; byteCount: number }>;
  /** Every other section, with the reason. `included` and `omitted` together name every section, always. */
  omitted: AutomationStudioRecoveryContextOmission[];
  byteCount: number;
  byteBudget: number;
};

export type AutomationStudioRuntimeRecoveryContextInput = {
  /** The persisted run record. Preferred over the live trace wherever it carries the same fact. */
  detail: AutomationStudioFlowRunDetail;
  /** The live trace attempt, read only for the comparison and the recovery ladder, which the run record does not keep whole. */
  failedAttempt?: AutomationStudioNodeAttemptTrace;
  subflowId?: string;
  adaptations?: AutomationStudioFlowAdaptation[];
  byteBudget?: number;
};

/**
 * The default budget, in bytes.
 *
 * It sits beside the 3,000-byte failure-evidence packet under the same
 * per-call input allowance, and a runtime diagnosis defaults to 10,000 total
 * tokens for the whole run. 4,000 bytes is roughly 1,300 tokens: enough for
 * every section a typical failure produces, and small enough that the page
 * evidence and the instructions still fit beside it.
 */
export const AUTOMATION_STUDIO_RECOVERY_CONTEXT_MAX_BYTES = 4_000;

/**
 * The floor. The `omitted` record for eleven sections costs roughly 700 bytes
 * on its own, and that record is the one thing the budget may never squeeze
 * out, so a caller cannot ask for a budget that could not hold it.
 */
const MINIMUM_RECOVERY_CONTEXT_BYTES = 1_500;
const MAXIMUM_RECOVERY_CONTEXT_BYTES = 16_000;

/** How many items each list section carries. Small on purpose: this is orientation, not a history. */
const SECTION_ITEM_LIMIT = 8;

/**
 * What a section builder returns when the section existed and Core refused to
 * carry it. A marker rather than `undefined`, so a refusal reaches the
 * `omitted` list as `withheld` instead of disappearing into `absent`.
 */
const WITHHELD_SECTION = "withheld" as const;

type AutomationStudioRecoveryContextSectionValue = JsonObject | typeof WITHHELD_SECTION;

export function buildAutomationStudioRuntimeRecoveryContext(input: AutomationStudioRuntimeRecoveryContextInput): AutomationStudioRuntimeRecoveryContext {
  const byteBudget = Math.min(MAXIMUM_RECOVERY_CONTEXT_BYTES, Math.max(MINIMUM_RECOVERY_CONTEXT_BYTES, Math.trunc(input.byteBudget ?? AUTOMATION_STUDIO_RECOVERY_CONTEXT_MAX_BYTES)));
  const record = failedActionRecord(input.detail);
  const built = recoveryContextSections(input, record);
  const context: AutomationStudioRuntimeRecoveryContext = {
    schemaVersion: "automation-studio.recovery-context.v1",
    sections: {},
    included: [],
    omitted: [],
    byteCount: 0,
    byteBudget
  };
  for (const section of AUTOMATION_STUDIO_RECOVERY_CONTEXT_SECTIONS) {
    const value = built[section];
    if (value === undefined || value === WITHHELD_SECTION) {
      context.omitted.push({ section, reason: value === WITHHELD_SECTION ? "withheld" : "absent", byteCount: 0 });
      continue;
    }
    context.sections[section] = value;
    context.included.push({ section, byteCount: serializedByteCount(value) });
  }
  trimRecoveryContextToBudget(context);
  return context;
}

/**
 * Drops included sections lowest priority first until the whole object fits,
 * recording each drop as `byte_budget` with what it cost.
 *
 * The size is re-measured on the whole context every time, because each
 * omission entry it writes costs bytes too. When nothing is left to drop the
 * loop stops and `byteCount` reports the truth rather than a fiction: the
 * bookkeeping is not droppable, so a context can legitimately end up over its
 * own budget with every section already gone, and saying so is better than
 * throwing away the record of what was withheld.
 */
function trimRecoveryContextToBudget(context: AutomationStudioRuntimeRecoveryContext): void {
  context.byteCount = serializedByteCount(context);
  while (context.byteCount > context.byteBudget && context.included.length) {
    const dropped = context.included.pop()!;
    delete context.sections[dropped.section];
    context.omitted.push({ section: dropped.section, reason: "byte_budget", byteCount: dropped.byteCount });
    context.byteCount = serializedByteCount(context);
  }
  context.omitted.sort((left, right) =>
    AUTOMATION_STUDIO_RECOVERY_CONTEXT_SECTIONS.indexOf(left.section) - AUTOMATION_STUDIO_RECOVERY_CONTEXT_SECTIONS.indexOf(right.section));
  context.byteCount = serializedByteCount(context);
}

export function serializedByteCount(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
}

/**
 * Each section, or `undefined` where the run produced nothing for it. A
 * section that would carry an empty object or an empty list is `undefined`
 * rather than present-and-empty, so "the run had none" is recorded once, as an
 * `absent` omission, instead of twice in two shapes.
 */
function recoveryContextSections(
  input: AutomationStudioRuntimeRecoveryContextInput,
  record: AutomationStudioFlowRunActionAttemptRecord | undefined
): Partial<Record<AutomationStudioRecoveryContextSection, AutomationStudioRecoveryContextSectionValue>> {
  const comparison = input.failedAttempt?.transitionComparison;
  const metadata = record?.metadata;
  const adaptations = matchingAdaptations(input.adaptations, record);
  return withoutEmptySections({
    failure: failureSection(record),
    expected_transition: comparison ? boundedSection({
      nodeId: comparison.expected.nodeId,
      definitionId: comparison.expected.definitionId,
      expectedRoute: comparison.expected.expectedRoute,
      expectedStatus: comparison.expected.expectedStatus,
      expectedOutputIds: Object.keys(comparison.expected.expectedOutputs ?? {}).slice(0, SECTION_ITEM_LIMIT),
      expectedEffectTypes: (comparison.expected.expectedEffects ?? []).map((effect) => effect.type).slice(0, SECTION_ITEM_LIMIT),
      // Authored document data, not a resolved value. Without it the model is
      // told what failed and never what was supposed to happen.
      expectedState: comparison.expected.expectedState,
      tolerance: comparison.expected.tolerance as JsonValue | undefined
    }) : undefined,
    actual_transition: comparison ? boundedSection({
      status: comparison.actual.status,
      route: comparison.actual.route,
      comparisonStatus: comparison.status,
      // Ids and types only: `actual.outputs` and the effect payloads beside
      // them are live values of unknown sensitivity.
      actualOutputIds: Object.keys(comparison.actual.outputs).slice(0, SECTION_ITEM_LIMIT),
      actualEffectTypes: comparison.actual.effects.map((effect) => effect.type).slice(0, SECTION_ITEM_LIMIT),
      diffSummary: comparison.diffSummary as unknown as JsonValue
    }) : undefined,
    state_diff: boundedDomainSection(metadata?.stateRefs),
    failed_target: targetResolutionSection(metadata?.targetResolution),
    recovery_candidates: recoveryCandidatesSection(input.failedAttempt),
    subflow: subflowSection(input),
    route_context: routeContextSection(input.detail),
    known_adaptations: adaptations.length ? boundedSection({ adaptations: adaptations.map(compactAdaptation) }) : undefined,
    recent_nodes: recentNodesSection(input.detail, record),
    recording_context: recordingContextSection(adaptations)
  });
}

/** The last failed or unknown attempt the run recorded: the one the recovery is about. */
function failedActionRecord(detail: AutomationStudioFlowRunDetail): AutomationStudioFlowRunActionAttemptRecord | undefined {
  return [...(detail.actionAttempts ?? [])].reverse().find((attempt) => attempt.status === "failed" || attempt.status === "unknown");
}

function failureSection(record: AutomationStudioFlowRunActionAttemptRecord | undefined): JsonObject | undefined {
  if (!record) return undefined;
  // Stored records are parsed again before use, as everywhere else that reads
  // one. `message` is deliberately not carried: the failure record's own
  // `expected` and `actual` are contractually short and free of page content,
  // and the prose is not.
  const failure = parseAutomationStudioFailureRecord(record.failure);
  return boundedSection({
    attemptId: record.attemptId,
    nodeId: record.nodeId,
    definitionId: record.definitionId,
    status: record.status,
    route: record.route,
    comparisonStatus: record.comparisonStatus,
    failure: failure ? boundedSection({
      category: failure.category,
      code: failure.code,
      retryable: failure.retryable,
      stage: failure.stage,
      expected: failure.expected,
      actual: failure.actual
    }) : undefined
  });
}

/**
 * The failed target, as metadata about how resolution went rather than as
 * anything that addresses an element.
 *
 * `candidateId` is not carried. It is minted by whichever domain supplied the
 * candidates, so Core cannot promise it is not a locator, and Phase T's whole
 * point is that no such string reaches the model.
 */
function targetResolutionSection(value: JsonValue | undefined): JsonObject | undefined {
  if (!isJsonRecordValue(value)) return undefined;
  return boundedSection({
    status: value.status,
    candidateCount: value.candidateCount,
    minimumConfidence: value.minimumConfidence,
    confidence: value.confidence,
    normalizedScore: value.normalizedScore,
    matchedSignals: boundedStringList(value.matchedSignals),
    failedSignals: boundedStringList(value.failedSignals)
  });
}

function recoveryCandidatesSection(attempt: AutomationStudioNodeAttemptTrace | undefined): JsonObject | undefined {
  const decision = attempt?.recoveryDecision;
  if (!decision?.candidates.length) return undefined;
  return boundedSection({
    candidates: decision.candidates.slice(0, SECTION_ITEM_LIMIT).map((candidate) => ({
      kind: candidate.kind,
      priority: candidate.priority,
      label: candidate.label,
      reason: candidate.reason,
      ...(candidate.targetNodeId ? { targetNodeId: candidate.targetNodeId } : {}),
      ...(candidate.edgeId ? { edgeId: candidate.edgeId } : {}),
      ...(candidate.subflowId ? { subflowId: candidate.subflowId } : {})
    })),
    selectedKind: decision.selected?.kind
  });
}

function subflowSection(input: AutomationStudioRuntimeRecoveryContextInput): JsonObject | undefined {
  const entries = input.detail.subflows.slice(-SECTION_ITEM_LIMIT).map((entry) => ({
    subflowId: entry.subflowId,
    status: entry.status,
    completed: entry.exitedAt !== undefined
  }));
  if (input.subflowId === undefined && !entries.length) return undefined;
  return boundedSection({ currentSubflowId: input.subflowId, entries: entries.length ? entries : undefined });
}

function routeContextSection(detail: AutomationStudioFlowRunDetail): JsonObject | undefined {
  if (!detail.routeDecisions.length) return undefined;
  return boundedSection({
    decisions: detail.routeDecisions.slice(-SECTION_ITEM_LIMIT).map((decision) => ({
      routerId: decision.routerId,
      ...(decision.selectedRuleId ? { selectedRuleId: decision.selectedRuleId } : {}),
      ...(decision.selectedSubflowId ? { selectedSubflowId: decision.selectedSubflowId } : {}),
      ...(decision.fallbackUsed ? { fallbackUsed: true } : {}),
      ...(decision.rejectedRuleIds?.length ? { rejectedRuleIds: decision.rejectedRuleIds.slice(0, SECTION_ITEM_LIMIT) } : {})
    }))
  });
}

function recentNodesSection(detail: AutomationStudioFlowRunDetail, record: AutomationStudioFlowRunActionAttemptRecord | undefined): JsonObject | undefined {
  const order = record?.order ?? Number.MAX_SAFE_INTEGER;
  const succeeded = (detail.actionAttempts ?? [])
    .filter((attempt) => attempt.status === "succeeded" && attempt.order < order)
    .slice(-SECTION_ITEM_LIMIT)
    .map((attempt) => ({ nodeId: attempt.nodeId, definitionId: attempt.definitionId, order: attempt.order, ...(attempt.route ? { route: attempt.route } : {}) }));
  return succeeded.length ? boundedSection({ succeeded }) : undefined;
}

/**
 * The adaptations already recorded for this node, as identity and verdict only.
 * A `patch` carries repair targets and an `observedState` carries whatever the
 * domain put in it, so neither is in here: the model is told what has been
 * tried and how it went, not handed the old repair to copy.
 */
function matchingAdaptations(adaptations: AutomationStudioFlowAdaptation[] | undefined, record: AutomationStudioFlowRunActionAttemptRecord | undefined): AutomationStudioFlowAdaptation[] {
  if (!adaptations?.length || !record) return [];
  return adaptations.filter((adaptation) => isJsonRecordValue(adaptation.failedAction) && adaptation.failedAction.nodeId === record.nodeId).slice(0, SECTION_ITEM_LIMIT);
}

function compactAdaptation(adaptation: AutomationStudioFlowAdaptation): JsonObject {
  const validations = adaptation.validationResults ?? [];
  return {
    adaptationId: adaptation.adaptationId,
    status: adaptation.status,
    riskLevel: adaptation.riskLevel,
    author: adaptation.author,
    trigger: adaptation.trigger,
    validationsSucceeded: validations.filter((result) => result.status === "succeeded").length,
    validationsFailed: validations.filter((result) => result.status === "failed").length
  };
}

function recordingContextSection(adaptations: AutomationStudioFlowAdaptation[]): JsonObject | undefined {
  const recordingIds = [...new Set(adaptations.flatMap((adaptation) => adaptation.sourceRecordingIds ?? []))].slice(0, SECTION_ITEM_LIMIT);
  return recordingIds.length ? boundedSection({ recordingIds }) : undefined;
}

/**
 * A section built from a value a domain supplied -- today the host's state
 * diff, read off the persisted run record rather than the live trace.
 *
 * It is not run through `sanitizeAutomationStudioLlmFailureEvidence`: that gate
 * is task-scoped, demands a schema version, and refuses anything over the
 * 3,000-byte failure-evidence limit, none of which is the question here. What
 * is asked instead is the part that matters for a value Core does not own --
 * is it serializable JSON, is it bounded, and does it carry a key that means
 * "page source" -- and the byte budget above does the rest.
 */
function boundedDomainSection(stateRefs: JsonValue | undefined): AutomationStudioRecoveryContextSectionValue | undefined {
  if (!isJsonRecordValue(stateRefs) || !isJsonRecordValue(stateRefs.stateDiff)) return undefined;
  return boundedDomainValue(stateRefs.stateDiff, 0) ? { stateDiff: stateRefs.stateDiff } : WITHHELD_SECTION;
}

const FORBIDDEN_DOMAIN_SECTION_KEYS = new Set(["html", "innerhtml", "outerhtml", "pagesource", "snapshot", "cookies", "headers", "selector", "selectors"]);

function boundedDomainValue(value: JsonValue, depth: number): boolean {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= 1_000;
  if (depth > 8) return false;
  if (Array.isArray(value)) return value.length <= 64 && value.every((item) => boundedDomainValue(item, depth + 1));
  const entries = Object.entries(value);
  if (entries.length > 64) return false;
  return entries.every(([key, item]) =>
    key.length <= 100 && !FORBIDDEN_DOMAIN_SECTION_KEYS.has(key.replace(/[_-]/gu, "").toLowerCase()) && boundedDomainValue(item, depth + 1));
}

/** Drops the keys a section did not have, so an absent field is absent rather than `null`. */
function boundedSection(fields: Record<string, JsonValue | undefined>): JsonObject {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as JsonObject;
}

function withoutEmptySections(
  sections: Partial<Record<AutomationStudioRecoveryContextSection, AutomationStudioRecoveryContextSectionValue | undefined>>
): Partial<Record<AutomationStudioRecoveryContextSection, AutomationStudioRecoveryContextSectionValue>> {
  const kept: Partial<Record<AutomationStudioRecoveryContextSection, AutomationStudioRecoveryContextSectionValue>> = {};
  for (const section of AUTOMATION_STUDIO_RECOVERY_CONTEXT_SECTIONS) {
    const value = sections[section];
    if (value === WITHHELD_SECTION) kept[section] = value;
    else if (value && Object.keys(value).length) kept[section] = value;
  }
  return kept;
}

function boundedStringList(value: JsonValue | undefined): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string" && item.length <= 60).slice(0, SECTION_ITEM_LIMIT);
  return items.length ? items : undefined;
}

function isJsonRecordValue(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
