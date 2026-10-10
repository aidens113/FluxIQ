// `recoveryContext`: the one domain-neutral description of a runtime failure
// that the model is asked to repair. Every section is carried whole: there is
// no byte budget, no per-section item limit and no trim ladder (2026-09-30,
// "the model sees the whole page"). Only secret-shaped values, locator-shaped
// text and the raw-payload keys below are withheld.
//
// Core's harness packet has had slots for most of this since it was written,
// and the one runtime caller filled four of them -- instructions, recent
// actions, a 3,000-byte page snapshot, and the policy gates. Expected state,
// the before/after state diff, the failed target, the router and subflow the
// run was in, prior adaptations and the recording behind them never reached the
// model at all. So the model was asked to repair an automation while being told
// almost nothing about what actually happened.
//
// These are the decisions that shape this module.
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
// **Authored data is carried, and it passes the same guards in every section
// that carries it.** Carrying `expectedState` is not the concession it looks
// like -- a repair told what failed and never what was supposed to happen is
// being asked to work blind -- but what it may not be is carried *more loosely*
// here than three sections down. `repair-context/parameter-screen.ts` screens
// the very same object out of the very same node's authored parameters:
// `runtime/executor/expected-transition.ts` reads
// `node.parameterValues.expectedState`, and this section carried what it read,
// verbatim. So one request could name `expectedState.conditions[0].expected` as
// withheld under `step_parameters` and print it under `expected_transition`,
// unscreened for credentials and unbounded in length -- and a refusal the same
// request contradicts is not a refusal. The tightened screen was never the
// exposure; the loose one beside it was. The authored state is therefore walked
// here too, and **the two screens on one request now agree** on the three things
// that matter: no credential-shaped string travels, no unbounded string travels
// whole, and whatever does not travel is named, at the same position the other
// screen names it at.
//
// Where the two still differ is deliberate and one-directional. The parameter
// screen additionally demands that a string's *key* be one of Core's own words,
// which is right for a typing step's payload and would gut an expectation --
// `signalPath`, a condition's own subject, is not in that vocabulary. So this
// screen is the looser of the two on vocabulary and identical to it on safety,
// which is the only direction an asymmetry between them may run.
//
// The one thing they do *not* share is the notation, and that is a finding
// rather than a preference. A bracketed index does not survive the locator
// screen below: `.assert` after a `]` satisfies the class-selector shape's
// lookbehind, so `expectedState.conditions[1].assert.expected` leaves here as
// the literal string `[locator withheld]`. Nothing caught it because every path
// a run bundle has been observed to carry descends through keys rather than
// indices -- `url`, `selector`, `extractList.handle` -- and a dot after a word
// character is not a selector. This screen writes
// `expectedState.conditions.1.assert.expected` instead, which survives intact,
// while a path through an author's own locator-shaped key (`expectedState.#confirm`)
// is still redacted, which is the screen doing its job on a path rather than
// mangling one. `step_parameters`'s notation is minted in `parameter-screen.ts`,
// which this task may not touch, so its indexed paths still arrive destroyed and
// a test here pins that rather than leaving it to be rediscovered.
//
// **A key rule cannot see inside a sentence.** Everything above works on keys,
// and two of the most useful fields here are free text a domain wrote. Every
// string in the finished context therefore goes through `locator-text.ts`,
// which removes what is shaped like a way to address an element and leaves the
// rest of the sentence standing.
//
// **The order is fixed, and it is a list rather than a score.** A ranking
// computed per failure would make the context's shape depend on the failure,
// and two runs of the same Flow would hand the model different evidence for
// reasons no reader could reconstruct. `AUTOMATION_STUDIO_RECOVERY_CONTEXT_SECTIONS`
// is that list. It orders the sections; it never decides which are shown.
//
// **An empty section and a withheld section are different facts.** This is the
// whole point of the `omitted` list. A context that had no state diff because
// the host captured none, and a context whose state diff Core refused to carry,
// must not read alike -- to the model or to whoever reads the run a week later.
// So every section named in the list appears in exactly one of `included` or
// `omitted`, always, and an omission says which of the two it was.
// `included.length + omitted.length` is the section count, and a test holds
// that.
//
// Recent browser events are deliberately not here. Nothing in the system
// captures them, adding a capture means an extension change, and the Week 2
// plan (decision L11) makes that conditional on the dry-run diagnoses showing
// that the state diff is not enough. That evidence does not exist yet.

import { parseAutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowAdaptation, AutomationStudioFlowRunActionAttemptRecord, AutomationStudioFlowRunDetail } from "../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../executor.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowRouter } from "../../model/index.ts";
import { automationStudioWithoutLocators, screenAutomationStudioLlmEvidence } from "../llm/harness/index.ts";
import { automationStudioFlowGraphSection, automationStudioScreenedAuthoredState, automationStudioStepParametersSection } from "./repair-context/index.ts";

/**
 * Every section, in the order the context carries them. The order is the
 * contract: it is the order a reader may assume. Nothing is dropped for size.
 *
 * `recent_nodes` overlaps the packet's own `recentActions`, deliberately. The
 * packet's list is the last twelve *attempts* with their statuses and failure
 * categories; this is the ordered chain of nodes that actually succeeded before
 * the failure, and it is here so that `recoveryContext` is readable on its own
 * by the recovery plan and by the adaptation that records it. It is next to
 * last in priority precisely because the packet already says most of it.
 *
 * `recovered_failures` is its counterpart and ranks far higher, because what a
 * run survived is evidence about the page and what it walked past is not. It
 * sits immediately behind `recovery_candidates`: the same kind of fact -- what
 * the recovery had to work with -- one step wider than the failure being
 * repaired.
 *
 * `flow_graph` and `step_parameters` sit *after* the two transition sections
 * and before everything else, and where they sit is the whole of how one fixed
 * list serves two entry points. A failed step is repaired from what the step
 * expected and what it got, so the transitions come first and nothing about
 * that reading changed. A refuted *result* has no transition comparison at all
 * -- every step did what it said -- so both transition sections are absent, and
 * these two arrive immediately behind the failure record, which is where a
 * repair that must rewrite the Flow needs them. No ranking is computed and no
 * section moves: the same list reads differently only because a different run
 * produced different sections.
 */
export const AUTOMATION_STUDIO_RECOVERY_CONTEXT_SECTIONS = [
  "failure",
  "expected_transition",
  "actual_transition",
  "flow_graph",
  "step_parameters",
  "state_diff",
  "failed_target",
  "recovery_candidates",
  "recovered_failures",
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
 * failure was not inside a subflow, no adaptation matched. `withheld` means it
 * existed and carried a secret-shaped value or a raw-payload key, so Core
 * refused to carry it. There is no size reason: no section is dropped to fit.
 *
 * Two reasons rather than one flag, because collapsing them makes
 * a context that lost its evidence indistinguishable from one that never had
 * any -- which is the failure this whole record exists to prevent. In
 * particular a refusal must never read as an absence: "the host captured no
 * state diff" and "the state diff carried something Core will not pass on" are
 * different problems with different answers.
 */
export type AutomationStudioRecoveryContextOmissionReason = "absent" | "withheld";

export type AutomationStudioRecoveryContextOmission = {
  section: AutomationStudioRecoveryContextSection;
  reason: AutomationStudioRecoveryContextOmissionReason;
  /** Always zero: an absent section cost nothing and a withheld one is not measured. */
  byteCount: number;
};

export type AutomationStudioRuntimeRecoveryContext = {
  schemaVersion: "automation-studio.recovery-context.v1";
  /** Only the sections that made it. Keyed by section name so a reader never positionally indexes them. */
  sections: Partial<Record<AutomationStudioRecoveryContextSection, JsonObject>>;
  /** The included sections in order, with what each one costs. */
  included: Array<{ section: AutomationStudioRecoveryContextSection; byteCount: number }>;
  /** Every other section, with the reason. `included` and `omitted` together name every section, always. */
  omitted: AutomationStudioRecoveryContextOmission[];
  /** The whole context's serialized size. A measurement, never a limit. */
  byteCount: number;
};

export type AutomationStudioRuntimeRecoveryContextInput = {
  /** The persisted run record. Preferred over the live trace wherever it carries the same fact. */
  detail: AutomationStudioFlowRunDetail;
  /** The live trace attempt, read only for the comparison and the recovery ladder, which the run record does not keep whole. */
  failedAttempt?: AutomationStudioNodeAttemptTrace;
  /**
   * The Flow that ran: its nodes, its edges, and the authored parameters each
   * step ran with. Absent where the caller could not read it, which is a fact
   * the context states rather than hides -- a repair told nothing about the
   * graph and a repair shown an empty graph are different situations.
   */
  flow?: AutomationStudioFlowDocument | undefined;
  /** The Flow's routers, whose rules are the only place its branching is written down. */
  routers?: readonly AutomationStudioFlowRouter[] | undefined;
  /**
   * The bound domain's declared denied keys, exactly as declared.
   *
   * Required before any parameter is projected, and absent means nobody
   * declared rather than "deny nothing": `step_parameters` is then recorded
   * `withheld`, which is the same fail-closed reading the packet builder
   * applies to every evidence slot.
   */
  deniedEvidenceKeys?: readonly string[] | undefined;
  subflowId?: string;
  adaptations?: AutomationStudioFlowAdaptation[];
};

/**
 * What a section builder returns when the section existed and Core refused to
 * carry it. A marker rather than `undefined`, so a refusal reaches the
 * `omitted` list as `withheld` instead of disappearing into `absent`.
 */
const WITHHELD_SECTION = "withheld" as const;

type AutomationStudioRecoveryContextSectionValue = JsonObject | typeof WITHHELD_SECTION;

export function buildAutomationStudioRuntimeRecoveryContext(input: AutomationStudioRuntimeRecoveryContextInput): AutomationStudioRuntimeRecoveryContext {
  const record = failedActionRecord(input.detail);
  const built = recoveryContextSections(input, record);
  const context: AutomationStudioRuntimeRecoveryContext = {
    schemaVersion: "automation-studio.recovery-context.v1",
    sections: {},
    included: [],
    omitted: [],
    byteCount: 0
  };
  for (const section of AUTOMATION_STUDIO_RECOVERY_CONTEXT_SECTIONS) {
    const value = built[section];
    if (value === undefined || value === WITHHELD_SECTION) {
      context.omitted.push({ section, reason: value === WITHHELD_SECTION ? "withheld" : "absent", byteCount: 0 });
      continue;
    }
    // The backstop for the finding this file's authored-state paragraph
    // describes, applied where the locator screen already is: in the loop,
    // rather than in a builder, so it covers every section at once and a
    // section added later cannot forget it. It is all-or-nothing because
    // `screenAutomationStudioLlmEvidence` answers a question rather than
    // rewriting a value, so a section that trips it is refused whole and
    // recorded `withheld` -- exactly the reading that reason exists for. Only
    // the credential half is asked: the domain's denied *keys* are not, because
    // `selector` is one of them and a condition names one, and refusing
    // `expected_transition` over that would withdraw the evidence this section
    // exists to carry. The authored screen below has already removed a
    // credential from the one section an author can write into, which is what
    // keeps this backstop free for the sections Core writes itself.
    if (screenAutomationStudioLlmEvidence(value, []).secretShaped) {
      context.omitted.push({ section, reason: "withheld", byteCount: 0 });
      continue;
    }
    // Screened here rather than inside each builder, so the rule covers every
    // section at once and a section added later cannot forget it. Redaction
    // changes sizes, so it happens before anything is measured.
    const screened = automationStudioWithoutLocators(value);
    context.sections[section] = screened;
    context.included.push({ section, byteCount: serializedByteCount(screened) });
  }
  context.byteCount = serializedByteCount(context);
  return context;
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
    failure: failureSection(record, input.failedAttempt),
    expected_transition: comparison ? boundedSection({
      nodeId: comparison.expected.nodeId,
      definitionId: comparison.expected.definitionId,
      expectedRoute: comparison.expected.expectedRoute,
      expectedStatus: comparison.expected.expectedStatus,
      expectedOutputIds: Object.keys(comparison.expected.expectedOutputs ?? {}),
      expectedEffectTypes: (comparison.expected.expectedEffects ?? []).map((effect) => effect.type),
      // Authored document data, not a resolved value. Without it the model is
      // told what failed and never what was supposed to happen -- so it is
      // carried, screened rather than refused, with every path it could not
      // carry named beside it.
      ...authoredStateFields(comparison.expected.expectedState),
      // Core's own, derived from the node's `definitionId` in
      // `executor/expected-transition.ts` and never authored, so the authored
      // screen has nothing to say about it.
      tolerance: comparison.expected.tolerance as JsonValue | undefined
    }) : undefined,
    actual_transition: comparison ? boundedSection({
      status: comparison.actual.status,
      route: comparison.actual.route,
      comparisonStatus: comparison.status,
      // Ids and types only: `actual.outputs` and the effect payloads beside
      // them are live values of unknown sensitivity.
      actualOutputIds: Object.keys(comparison.actual.outputs),
      actualEffectTypes: comparison.actual.effects.map((effect) => effect.type),
      diffSummary: comparison.diffSummary as unknown as JsonValue
    }) : undefined,
    flow_graph: automationStudioFlowGraphSection({
      ...(input.flow ? { flow: input.flow } : {}),
      ...(input.routers?.length ? { routers: input.routers } : {}),
      ...(record?.nodeId ? { failedNodeId: record.nodeId } : {})
    }),
    step_parameters: stepParametersSection(input),
    state_diff: domainStateDiffSection(metadata?.stateRefs),
    failed_target: targetResolutionSection(metadata?.targetResolution),
    recovery_candidates: recoveryCandidatesSection(input.failedAttempt),
    recovered_failures: recoveredFailuresSection(input.detail, record),
    subflow: subflowSection(input),
    route_context: routeContextSection(input.detail),
    known_adaptations: adaptations.length ? boundedSection({ adaptations: adaptations.map(compactAdaptation) }) : undefined,
    recent_nodes: recentNodesSection(input.detail, record),
    recording_context: recordingContextSection(adaptations)
  });
}

/**
 * The step chain with its screened parameters, or a refusal.
 *
 * `WITHHELD_SECTION` rather than `undefined` when the bound domain declared no
 * keys: the run did produce steps, and Core refused to project their
 * parameters, which is a different fact from a run that took no step. The
 * omission list is what keeps the two apart, and this is exactly the case it
 * was built for.
 */
function stepParametersSection(input: AutomationStudioRuntimeRecoveryContextInput): AutomationStudioRecoveryContextSectionValue | undefined {
  const attempts = rootFrameAttempts(input.detail);
  if (!attempts.length) return undefined;
  if (input.deniedEvidenceKeys === undefined) return WITHHELD_SECTION;
  return automationStudioStepParametersSection({
    attempts,
    ...(input.flow ? { flow: input.flow } : {}),
    deniedKeys: input.deniedEvidenceKeys
  });
}

/** The last failed or unknown attempt the run recorded: the one the recovery is about. */
function failedActionRecord(detail: AutomationStudioFlowRunDetail): AutomationStudioFlowRunActionAttemptRecord | undefined {
  return [...rootFrameAttempts(detail)].reverse().find((attempt) => attempt.status === "failed" || attempt.status === "unknown");
}

/**
 * The root frame's attempts: the Flow's own steps, which every section here is
 * about. A called part's attempts (`parentAttemptId`) are its Call Subflow
 * attempt's, whose outcome is the root frame's, and a part's node can share an
 * id with one of the Flow's.
 */
function rootFrameAttempts(detail: AutomationStudioFlowRunDetail): AutomationStudioFlowRunActionAttemptRecord[] {
  return (detail.actionAttempts ?? []).filter((attempt) => attempt.parentAttemptId === undefined);
}

function failureSection(record: AutomationStudioFlowRunActionAttemptRecord | undefined, failedAttempt: AutomationStudioNodeAttemptTrace | undefined): JsonObject | undefined {
  if (!record) return undefined;
  // Stored records are parsed again before use, as everywhere else that reads
  // one. `message` is deliberately not carried: the record's own `expected`
  // and `actual` are contractually short, and the prose is not.
  //
  // What they are not is free of page content, whatever this comment used to
  // claim. They are a domain's sentences, and the web domain's name the
  // control the recording addressed, the candidates that were refused and what
  // each scored. That is the most useful thing in the request and it arrived
  // carrying a raw CSS selector, because a denied key is screened by key name
  // and `selector` inside a free-text field is not a key. Both fields now go
  // through `locator-text.ts` with the rest of the context: the scores and the
  // visible names survive, and anything shaped like a locator does not.
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
      actual: failure.actual,
      // A refuted result's synthetic live attempt carries the full screened
      // directive here. Unlike the 1,024-character prose fields, this keeps
      // the judge's bounded advice structurally intact for the repair.
      repair: resultRepairSection(failedAttempt?.inputs.resultRepair)
    }) : undefined
  });
}

function resultRepairSection(value: JsonValue | undefined): JsonObject | undefined {
  if (!isJsonRecordValue(value) || value.schemaVersion !== "automation-studio.result-repair-directive.v1") return undefined;
  return boundedSection({
    schemaVersion: value.schemaVersion,
    findings: Array.isArray(value.findings) ? value.findings : undefined,
    fix: Array.isArray(value.fix) ? value.fix : undefined,
    judgement: isJsonRecordValue(value.judgement) ? value.judgement : undefined,
    checked: boundedStringList(value.checked),
    withheld: value.withheld === true ? true : undefined
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
    candidates: decision.candidates.map((candidate) => ({
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
  const entries = input.detail.subflows.map((entry) => ({
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
    decisions: detail.routeDecisions.map((decision) => ({
      routerId: decision.routerId,
      ...(decision.selectedRuleId ? { selectedRuleId: decision.selectedRuleId } : {}),
      ...(decision.selectedSubflowId ? { selectedSubflowId: decision.selectedSubflowId } : {}),
      ...(decision.fallbackUsed ? { fallbackUsed: true } : {}),
      ...(decision.rejectedRuleIds?.length ? { rejectedRuleIds: [...decision.rejectedRuleIds] } : {})
    }))
  });
}

/**
 * The failures this run hit and went on past, and what resolved each one.
 *
 * The deterministic ladder is good at its job, and that is precisely how this
 * evidence went missing. A node that fails, is retried and then succeeds leaves
 * `recent_nodes` -- which keeps only `succeeded` attempts -- with nothing to
 * show, and `recoveryAttempts` has been written on every run since it existed
 * and read by nothing but a counter. So the model repairing the *terminal*
 * failure was told about that failure alone, as though the run had walked a
 * clean path up to it.
 *
 * Live run `run-muesyox4-930bef98` (2026-09-23) is what that costs. Three clicks
 * failed on the same control before the fourth worked, each with six controls of
 * the same family in front of the recovery, and the offsets said why: the
 * fixture opens a modal about four seconds after load and the first two clicks
 * fired at roughly 1.0s and 2.4s. Then `s6` failed for good, on an 819-byte page
 * with no same-family control and no fingerprint candidate on it -- and *that*
 * starved packet was the entire evidence the repair was given. The run had
 * already demonstrated that this page mutates on a timer. Nothing carried it.
 *
 * So each entry is one failed attempt the run survived, in order, with Core's
 * failure category, the offset from the run's start that makes a timing pattern
 * legible, and -- where a recovery record matches it -- how many candidates the
 * ladder had and which rung resolved it. The attempt under repair is excluded:
 * it is the `failure` section, and repeating it here would say the same thing
 * twice.
 *
 * Names, statuses and Core's own clock only, like every section here. The
 * ladder's `reason` is free text a domain may have written, so it travels the
 * same way `recovery_candidates` already carries one: through the locator screen
 * that every string in this context passes.
 */
function recoveredFailuresSection(detail: AutomationStudioFlowRunDetail, record: AutomationStudioFlowRunActionAttemptRecord | undefined): JsonObject | undefined {
  const attempts = rootFrameAttempts(detail);
  const survived = attempts.filter((attempt) => attempt.status === "failed" && attempt.attemptId !== record?.attemptId);
  if (!survived.length) return undefined;
  // The run's own start, so an offset is a number a reader can compare across
  // entries rather than a wall-clock instant they have to subtract by hand.
  const startedAt = detail.summary.startedAt ?? attempts[0]?.startedAt;
  const recoveries = new Map((detail.recoveryAttempts ?? []).map((recovery) => [recovery.attemptId, recovery]));
  const entries = survived.map((attempt) => {
    const recovery = recoveries.get(attempt.attemptId);
    const offsetMs = typeof startedAt === "number" && Number.isSafeInteger(attempt.startedAt) ? attempt.startedAt - startedAt : undefined;
    // Stored records are parsed again, as everywhere else that reads one, and
    // only Core's category name travels.
    const failureCategory = parseAutomationStudioFailureRecord(attempt.failure)?.category;
    return {
      nodeId: attempt.nodeId,
      definitionId: attempt.definitionId,
      order: attempt.order,
      ...(failureCategory ? { failureCategory } : {}),
      ...(offsetMs !== undefined && offsetMs >= 0 && offsetMs <= 86_400_000 ? { offsetMs } : {}),
      ...(recovery ? {
        resolution: recovery.status,
        candidateCount: recovery.candidateCount,
        ...(recovery.selectedKind ? { resolvedBy: recovery.selectedKind } : {}),
        ...(recovery.reason ? { reason: recovery.reason } : {})
      } : {})
    };
  });
  // How many failures the run absorbed in total, and on how many nodes. Every
  // entry is listed; the totals are a reader's summary of them.
  return boundedSection({
    entries,
    totalFailuresSurvived: survived.length,
    nodesAffected: new Set(survived.map((attempt) => attempt.nodeId)).size
  });
}

function recentNodesSection(detail: AutomationStudioFlowRunDetail, record: AutomationStudioFlowRunActionAttemptRecord | undefined): JsonObject | undefined {
  const order = record?.order ?? Number.MAX_SAFE_INTEGER;
  const succeeded = rootFrameAttempts(detail)
    .filter((attempt) => attempt.status === "succeeded" && attempt.order < order)
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
  return adaptations.filter((adaptation) => isJsonRecordValue(adaptation.failedAction) && adaptation.failedAction.nodeId === record.nodeId);
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
  const recordingIds = [...new Set(adaptations.flatMap((adaptation) => adaptation.sourceRecordingIds ?? []))];
  return recordingIds.length ? boundedSection({ recordingIds }) : undefined;
}

/**
 * A section built from a value a domain supplied -- today the host's state
 * diff, read off the persisted run record rather than the live trace.
 *
 * Carried whole: no string, item, entry or byte bound (2026-09-30). What is
 * still asked is the part that matters for a value Core does not own -- is it
 * acyclic JSON, and does it carry a key that means "page source" -- and the
 * credential screen every section passes does the rest.
 */
function domainStateDiffSection(stateRefs: JsonValue | undefined): AutomationStudioRecoveryContextSectionValue | undefined {
  if (!isJsonRecordValue(stateRefs) || !isJsonRecordValue(stateRefs.stateDiff)) return undefined;
  return carriableDomainValue(stateRefs.stateDiff, 0, new Set()) ? { stateDiff: stateRefs.stateDiff } : WITHHELD_SECTION;
}

const FORBIDDEN_DOMAIN_SECTION_KEYS = new Set(["html", "innerhtml", "outerhtml", "pagesource", "snapshot", "cookies", "headers", "selector", "selectors"]);

/** The recursion guard every JSON walk shares. Not a size bound: no real state diff nests this deep. */
const DOMAIN_VALUE_MAX_DEPTH = 64;

function carriableDomainValue(value: JsonValue, depth: number, seen: Set<object>): boolean {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (depth > DOMAIN_VALUE_MAX_DEPTH || seen.has(value)) return false;
  seen.add(value);
  const carriable = Array.isArray(value)
    ? value.every((item) => carriableDomainValue(item, depth + 1, seen))
    : Object.entries(value).every(([key, item]) =>
      !FORBIDDEN_DOMAIN_SECTION_KEYS.has(key.replace(/[_-]/gu, "").toLowerCase()) && carriableDomainValue(item, depth + 1, seen));
  seen.delete(value);
  return carriable;
}

/**
 * `expectedState` as the repair is shown it, and the paths that did not survive
 * named beside it under `expectedStateWithheld`.
 *
 * The screen itself and the argument for its bound are in
 * `repair-context/authored-state-screen.ts`, beside the parameter screen it now
 * agrees with. What belongs here is why the record takes the shape it does.
 *
 * **A field in the section, not an `omitted` entry.** The omission list is
 * section-granular by contract -- `included` and `omitted` together name every
 * section exactly once, and a test holds that -- so a path cannot go in it. The
 * section-level `withheld` reason is the wrong instrument anyway: it would
 * withdraw the node id, the expected route and the expected status along with the
 * one string that failed, which is the opposite of the point. What the omission
 * list establishes is the *rule* -- a thing screened out and a thing never
 * present must not read alike -- and at field granularity the form that rule
 * already takes in this request is `step_parameters`'s `parametersWithheld`.
 * This is that form, applied to the object both sections carry; because the list
 * sits inside the section it reaches a run bundle with the section, needing no
 * file but this one.
 */
function authoredStateFields(expectedState: JsonObject | undefined): Record<string, JsonValue | undefined> {
  if (!expectedState) return {};
  const screened = automationStudioScreenedAuthoredState(expectedState, "expectedState");
  return { expectedState: screened.value, expectedStateWithheld: screened.withheld.length ? screened.withheld : undefined };
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
  const items = value.filter((item): item is string => typeof item === "string");
  return items.length ? items : undefined;
}

function isJsonRecordValue(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
