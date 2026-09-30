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
import type { AutomationStudioFlowDraftAmendmentRefusal } from "../flow-draft/index.ts";
import type {
  AutomationStudioLlmEvidenceRestoredStep,
  AutomationStudioLlmEvidenceLoopAnswerability,
  AutomationStudioLlmEvidenceLoopDraftChange,
  AutomationStudioLlmEvidenceLoopDraftShown,
  AutomationStudioLlmEvidenceLoopProgress,
  AutomationStudioLlmEvidenceLoopTrace,
  AutomationStudioLlmUsageSummary
} from "../llm/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../loop-limits/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_DECISION_STEP_IDS } from "./decision-step-ids.ts";
import { automationStudioFlowBootstrapLargestSizeLimits } from "./plan/index.ts";

/**
 * A trace row as a reader of the loop's record sees one.
 *
 * `at` -- the moment the row was recorded, in epoch milliseconds -- was first
 * declared here rather than on the loop's trace type, on the reasoning that a
 * timestamp is a diagnostic and the loop's type is the contract its callers
 * build against. **That is exactly why nothing ever wrote one.** The loop is
 * the only thing that knows when a row happened, and a field the loop's own
 * type does not have is a field the loop cannot push: `run-mug776kx-0214b287`
 * published 41 rows and 0 of them carried a moment, so its 695 seconds stayed
 * one undivided gap in which a ten-minute stall and forty seventeen-second
 * steps look identical.
 *
 * It now lives on `AutomationStudioLlmEvidenceLoopTrace` and the loop stamps
 * every row it pushes. The intersection is kept because it is what every
 * reader of a *stored* row names, and because it still says the true thing: a
 * row from before the loop stamped them carries none, and a reader without one
 * falls back to ordering by `iteration`.
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
  /**
   * Why the call came to that code, in the domain's own closed vocabulary.
   *
   * A code names a family and a reason names the member.
   * `run-mug776kx-0214b287` published 14 rows reading
   * `web.action.rejected.invalid_input` and 8 reading
   * `web.action.rejected.target_unobserved`, and that is what a reader had to
   * diagnose from -- while the domain had computed, and thrown away, which of
   * thirty-three distinct reasons each one was: a node that cannot run where it
   * was asked to, an argument carrying keys the node does not take, a handle
   * that is not a handle, a handle naming nothing observed yet. Four different
   * defects, two words, and no way to tell how many of the fourteen were the
   * same bug.
   *
   * It is a code and never a sentence, held to the same shape `resultCode` is,
   * so it rides on this record under the same rule as everything else here.
   */
  resultReason?: string;
  /**
   * The node the call ran, as the domain resolved it against its own catalog.
   *
   * Never a name the model wrote. A model naming a node that does not exist
   * leaves this absent, and the reason says that is what happened -- which is
   * the whole distinction that lets this record stay identifiers and codes.
   */
  nodeId?: string;
  /** The bytes of evidence this call's result added to the loop's budget. */
  evidenceBytes?: number;
  /** How many draft steps an `amend_draft` decision edited. One code covers a whole amendment list, so the code alone cannot say. */
  amended?: number;
  /**
   * Which of this decision's amendments changed nothing, and why.
   *
   * `amended` says how many landed; this says what became of the rest, which is
   * the difference between a model editing a step that does not exist and one
   * restating what the draft already said. `run-muhubegx-9469de5e` made nine
   * amend decisions, seven of which applied nothing and five of those in a row,
   * and the published record kept one word -- `llm_evidence_loop.draft_unchanged`
   * -- for all seven.
   *
   * The loop's trace has carried this since t140; a step is what a reader of a
   * *stored* record sees, so without it here the refusals reach nothing anybody
   * reads. A step number the model wrote and a reason from the draft's own
   * closed set, which is a count and a code -- the only two kinds of thing this
   * record ever carries.
   */
  amendmentsRefused?: StepAmendmentRefusal[];
  /**
   * The same refusals as one flat list of codes, `<step>:<reason>[:<node>]`.
   *
   * The Lab's bundle projection keeps a list of scalars and drops a list of
   * objects, so on `run-mulx76vv-a882551e` eighteen refused amendments reached
   * the bundle as nothing: no reason, no node. Codes and identifiers joined by
   * a colon are still only codes and identifiers, and they survive any reader
   * that keeps a list of strings.
   */
  amendmentRefusals?: string[];
  /** Content-free measurement of the draft, page, and answerability transition. */
  progress?: AutomationStudioLlmEvidenceLoopProgress;
  /** Stable ids and bounded counts for one draft-amendment decision. */
  draftChange?: AutomationStudioLlmEvidenceLoopDraftChange;
  /** What the provider was shown of its draft, expressed only as bounded counts. */
  draft?: AutomationStudioLlmEvidenceLoopDraftShown;
  /** Content-free capability facts observed by the completion check. */
  answerability?: AutomationStudioLlmEvidenceLoopAnswerability;
  /** A withdrawn step the completion check put back before judging the draft: its position and how it was withdrawn. */
  restoredStep?: AutomationStudioLlmEvidenceRestoredStep;
  /** When the row was recorded, in epoch milliseconds. Absent where the loop recorded no moment. */
  at?: number;
  /** What the provider reported for the call that made this decision. Absent where it reported nothing. */
  usage?: AutomationStudioLlmUsageSummary;
};

/** A refused amendment as a step publishes it: the draft's own refusal, and the node its step held. */
type StepAmendmentRefusal = AutomationStudioFlowDraftAmendmentRefusal & { nodeId?: string };

/** One refusal in the flat form: a position, a reason, and optionally a node id. */
const EVIDENCE_STEP_AMENDMENT_REFUSAL_CODE = /^[0-9]{1,4}:[a-z_]{1,40}(?::[a-z0-9_.:-]{1,200})?$/i;

/** The shape a code must have to travel: no whitespace, so no sentence. */
const EVIDENCE_STEP_CODE = /^[a-z0-9_.:-]{1,100}$/i;
/** The usage figures a step carries, each a non-negative finite number and nothing else. */
const USAGE_FIELDS = ["inputTokens", "outputTokens", "totalTokens", "cacheHitInputTokens", "cacheMissInputTokens", "estimatedCostUsd"] as const;
/**
 * Why an amendment changed nothing, in the draft's own closed vocabulary.
 *
 * Keyed by that type, so a reason added in `../flow-draft/amendment.ts` fails
 * this file's type check until it is named here -- the same rule the shape and
 * its allow-list below are held to, for the same reason.
 */
const EVIDENCE_STEP_AMENDMENT_REFUSAL_REASONS: {
  readonly [Reason in AutomationStudioFlowDraftAmendmentRefusal["reason"]]: true
} = Object.freeze({
  no_such_step: true,
  already_so: true,
  no_such_position: true,
  run_by_the_loop: true,
  no_step_before_it: true,
  over_not_before: true,
  not_a_kept_step: true,
  did_not_work: true,
  already_in_flow: true,
  already_out: true
});
/**
 * The most refusals one step may report: the most amendments one decision may
 * carry (`llm/evidence-loop-decision.ts`'s `MAX_AMENDMENTS_PER_DECISION`).
 * Written out rather than read from there, like every other bound here.
 */
const MAX_EVIDENCE_STEP_AMENDMENT_REFUSALS = 16;
/**
 * The largest draft position a refusal may name. The number is the model's own
 * -- a refusal reading `no_such_step` is precisely the case where it named one
 * that is not there -- so it is bounded rather than trusted. No draft comes near
 * this, and a refusal naming something past it is left behind.
 */
const EVIDENCE_STEP_MAX_AMENDED_POSITION = 9_999;

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
  const amendmentsRefused = stepAmendmentRefusals(entry.amendmentsRefused);
  const progress = evidenceStepProgress(entry.progress);
  const draftChange = evidenceStepDraftChange(entry.draftChange);
  const draft = evidenceStepDraft(entry.draft);
  const answerability = evidenceStepAnswerability(entry.answerability);
  const restoredStep = evidenceStepRestoredStep(entry.restoredStep);
  const kept = {
    iteration: Number.isSafeInteger(entry.iteration) && entry.iteration >= 0 ? entry.iteration : 0,
    ...(entry.resultCode && EVIDENCE_STEP_CODE.test(entry.resultCode) ? { resultCode: entry.resultCode } : {}),
    // Each held to its own shape at the moment of publication, and left behind
    // when it does not fit. The guarantee this record rests on is that nothing
    // a tool returned and nothing the model wrote travels on it, and these two
    // arrive from a domain that could always put a sentence in one.
    ...(entry.resultReason && EVIDENCE_STEP_CODE.test(entry.resultReason) ? { resultReason: entry.resultReason } : {}),
    ...(entry.nodeId && EVIDENCE_STEP_ID.test(entry.nodeId) ? { nodeId: entry.nodeId } : {}),
    ...(nonNegative(entry.evidenceBytes) ? { evidenceBytes: entry.evidenceBytes as number } : {}),
    ...(nonNegative(entry.amended) ? { amended: entry.amended as number } : {}),
    ...(amendmentsRefused ? { amendmentsRefused, amendmentRefusals: amendmentsRefused.map(amendmentRefusalCode) } : {}),
    ...(progress ? { progress } : {}),
    ...(draftChange ? { draftChange } : {}),
    ...(draft ? { draft } : {}),
    ...(answerability ? { answerability } : {}),
    ...(restoredStep ? { restoredStep } : {}),
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

/**
 * The decision's refused amendments, each held to its own shape at the moment
 * of publication and left behind when it does not fit -- a step number inside
 * the bound and a reason the draft actually has. Absent when the decision
 * refused nothing, so a step that landed every amendment carries no field.
 */
function stepAmendmentRefusals(
  refusals: readonly StepAmendmentRefusal[] | undefined
): StepAmendmentRefusal[] | undefined {
  if (!refusals?.length) return undefined;
  const kept = refusals
    .filter((refusal) => isAmendmentRefusalStep(refusal.step) && Object.hasOwn(EVIDENCE_STEP_AMENDMENT_REFUSAL_REASONS, refusal.reason))
    .slice(0, MAX_EVIDENCE_STEP_AMENDMENT_REFUSALS)
    .map((refusal) => ({ step: refusal.step, reason: refusal.reason, ...(refusal.nodeId && EVIDENCE_STEP_ID.test(refusal.nodeId) ? { nodeId: refusal.nodeId } : {}) }));
  return kept.length ? kept : undefined;
}

/** A refusal in the flat form `<step>:<reason>[:<node>]`. */
function amendmentRefusalCode(refusal: StepAmendmentRefusal): string {
  return `${refusal.step}:${refusal.reason}${refusal.nodeId ? `:${refusal.nodeId}` : ""}`;
}

function isAmendmentRefusalStep(value: unknown): boolean {
  return boundedInteger(value, EVIDENCE_STEP_MAX_AMENDED_POSITION);
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
const EVIDENCE_STEP_FIELDS: Array<keyof AutomationStudioFlowBootstrapEvidenceStep> = ["toolId", "iteration", "callId", "effectApplied", "resultCode", "resultReason", "nodeId", "evidenceBytes", "amended", "amendmentsRefused", "amendmentRefusals", "progress", "draftChange", "draft", "answerability", "restoredStep", "at", "usage"];
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
      || (step.resultReason !== undefined && (typeof step.resultReason !== "string" || !EVIDENCE_STEP_CODE.test(step.resultReason)))
      || (step.nodeId !== undefined && (typeof step.nodeId !== "string" || !EVIDENCE_STEP_ID.test(step.nodeId)))
      || (step.evidenceBytes !== undefined && !boundedInteger(step.evidenceBytes, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxEvidenceBytes))
      || (step.amended !== undefined && !boundedInteger(step.amended, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations))
      || (step.at !== undefined && !boundedInteger(step.at, EVIDENCE_STEP_MAX_TIMESTAMP_MS))) return null;
    const usage = parseStepUsage(step.usage);
    if (step.usage !== undefined && !usage) return null;
    const amendmentsRefused = parseStepAmendmentRefusals(step.amendmentsRefused);
    if (step.amendmentsRefused !== undefined && !amendmentsRefused) return null;
    const amendmentRefusals = step.amendmentRefusals === undefined ? undefined : parseStepAmendmentRefusalCodes(step.amendmentRefusals);
    if (amendmentRefusals === null) return null;
    const progress = evidenceStepProgress(step.progress);
    if (step.progress !== undefined && !progress) return null;
    const draftChange = evidenceStepDraftChange(step.draftChange);
    if (step.draftChange !== undefined && !draftChange) return null;
    const draft = evidenceStepDraft(step.draft);
    if (step.draft !== undefined && !draft) return null;
    const answerability = evidenceStepAnswerability(step.answerability);
    if (step.answerability !== undefined && !answerability) return null;
    const restoredStep = evidenceStepRestoredStep(step.restoredStep);
    if (step.restoredStep !== undefined && !restoredStep) return null;
    steps.push({
      toolId: step.toolId,
      ...(step.iteration !== undefined ? { iteration: step.iteration as number } : {}),
      ...(step.callId !== undefined ? { callId: step.callId as string } : {}),
      ...(step.effectApplied !== undefined ? { effectApplied: step.effectApplied } : {}),
      ...(step.resultCode !== undefined ? { resultCode: step.resultCode } : {}),
      ...(step.resultReason !== undefined ? { resultReason: step.resultReason } : {}),
      ...(step.nodeId !== undefined ? { nodeId: step.nodeId } : {}),
      ...(step.evidenceBytes !== undefined ? { evidenceBytes: step.evidenceBytes as number } : {}),
      ...(step.amended !== undefined ? { amended: step.amended as number } : {}),
      ...(amendmentsRefused ? { amendmentsRefused } : {}),
      ...(amendmentRefusals ? { amendmentRefusals } : {}),
      ...(progress ? { progress } : {}),
      ...(draftChange ? { draftChange } : {}),
      ...(draft ? { draft } : {}),
      ...(answerability ? { answerability } : {}),
      ...(restoredStep ? { restoredStep } : {}),
      ...(step.at !== undefined ? { at: step.at as number } : {}),
      ...(usage ? { usage } : {})
    });
  }
  return steps;
}

const PROGRESS_FIELDS = ["draftRevisionBefore", "draftRevisionAfter", "pageState", "draftState", "answerabilityState"] as const;
const DRAFT_CHANGE_FIELDS = ["targetedStepIds", "appliedCount", "refusedCount", "keptStepCount", "rerunStepId"] as const;
const DRAFT_FIELDS = ["bytes", "budget", "steps", "instructionBytes", "unlisted", "withoutInput", "inputTooLarge", "overBudget", "budgetBelowFloor"] as const;
const ANSWERABILITY_FIELDS = ["recordsRequested", "recordProducerPresent", "recordStorePresent", "issueCode"] as const;
const MAX_DRAFT_CHANGE_TARGETS = 16;
// One decision may withdraw a rerun target and then append its replacement,
// producing two legitimate draft revisions inside one iteration.
const MAX_DRAFT_REVISIONS = AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations * 2;
// A seeded extend build may retain the full supported Flow, append one action
// in every loop iteration, and also carry the deterministic iteration-zero
// observation. This bounds represented draft positions, not revisions or the
// amendments allowed in one decision.
//
// **At the Flow size setting's largest value, not a Flow's own.** These readers
// read a trace row or a published step back, and no caller has the Flow in
// hand (the loop's own rows, the service's evidence trace, a stored failure
// diagnostic). A record written while a Flow's setting was higher must still
// read after it is lowered, so the bound is whatever any Flow could have held.
const MAX_REPRESENTED_DRAFT_STEPS = automationStudioFlowBootstrapLargestSizeLimits().maxTotalNodes
  + AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations
  + 1;

/**
 * A withdrawn step the completion check put back, as a row or a published step
 * carries it: a draft position and a closed word, or nothing when it is not
 * exactly that. Read here rather than imported from `../llm/`, for the same
 * reason every other member's reader is: this module imports only types from
 * there, and a value import closes a cycle through the provider adapters.
 */
export function evidenceStepRestoredStep(value: unknown): AutomationStudioLlmEvidenceRestoredStep | undefined {
  if (!isStepRecord(value) || !hasExactFields(value, ["step", "withdrawnAs"]) || !Number.isSafeInteger(value.step) || (value.step as number) < 1) return undefined;
  if (value.withdrawnAs !== "dropped" && value.withdrawnAs !== "exploratory") return undefined;
  return { step: value.step as number, withdrawnAs: value.withdrawnAs };
}

/**
 * Optional progress instrumentation is all-or-nothing. A malformed member is
 * left behind by trace sanitization and publication; the stored-step parser
 * uses the same function and rejects the claimed Core record instead.
 */
export function evidenceStepProgress(value: unknown): AutomationStudioLlmEvidenceLoopProgress | undefined {
  if (!isStepRecord(value) || !hasExactFields(value, PROGRESS_FIELDS)
    || !boundedInteger(value.draftRevisionBefore, MAX_DRAFT_REVISIONS)
    || !boundedInteger(value.draftRevisionAfter, MAX_DRAFT_REVISIONS)
    || !["changed", "unchanged", "unobserved"].includes(value.pageState as string)
    || !["changed", "unchanged"].includes(value.draftState as string)
    || !["first_observed", "changed", "unchanged", "unobserved"].includes(value.answerabilityState as string)) return undefined;
  return {
    draftRevisionBefore: value.draftRevisionBefore as number,
    draftRevisionAfter: value.draftRevisionAfter as number,
    pageState: value.pageState as AutomationStudioLlmEvidenceLoopProgress["pageState"],
    draftState: value.draftState as AutomationStudioLlmEvidenceLoopProgress["draftState"],
    answerabilityState: value.answerabilityState as AutomationStudioLlmEvidenceLoopProgress["answerabilityState"]
  };
}

export function evidenceStepDraftChange(value: unknown): AutomationStudioLlmEvidenceLoopDraftChange | undefined {
  if (!isStepRecord(value) || !hasExactFields(value, DRAFT_CHANGE_FIELDS)
    || !Array.isArray(value.targetedStepIds) || value.targetedStepIds.length > MAX_DRAFT_CHANGE_TARGETS
    || !value.targetedStepIds.every((id) => typeof id === "string" && EVIDENCE_STEP_ID.test(id))
    || new Set(value.targetedStepIds).size !== value.targetedStepIds.length
    || !boundedInteger(value.appliedCount, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations)
    || !boundedInteger(value.refusedCount, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations)
    || !boundedInteger(value.keptStepCount, MAX_REPRESENTED_DRAFT_STEPS)
    || (value.rerunStepId !== undefined && (typeof value.rerunStepId !== "string" || !EVIDENCE_STEP_ID.test(value.rerunStepId)))) return undefined;
  return {
    targetedStepIds: [...value.targetedStepIds] as string[],
    appliedCount: value.appliedCount as number,
    refusedCount: value.refusedCount as number,
    keptStepCount: value.keptStepCount as number,
    ...(value.rerunStepId !== undefined ? { rerunStepId: value.rerunStepId } : {})
  };
}

export function evidenceStepDraft(value: unknown): AutomationStudioLlmEvidenceLoopDraftShown | undefined {
  if (!isStepRecord(value) || !hasExactFields(value, DRAFT_FIELDS)
    || !boundedInteger(value.bytes, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxEvidenceBytes)
    || !boundedInteger(value.budget, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxEvidenceBytes)
    || !boundedInteger(value.steps, MAX_REPRESENTED_DRAFT_STEPS)
    || !boundedInteger(value.instructionBytes, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxEvidenceBytes)
    || (value.unlisted !== undefined && !boundedInteger(value.unlisted, MAX_REPRESENTED_DRAFT_STEPS))
    || (value.withoutInput !== undefined && !boundedInteger(value.withoutInput, value.steps as number))
    || (value.inputTooLarge !== undefined && !boundedInteger(value.inputTooLarge, value.steps as number))
    || (value.steps as number) + (value.unlisted as number | undefined ?? 0) > MAX_REPRESENTED_DRAFT_STEPS
    || (value.overBudget !== undefined && value.overBudget !== true)
    || (value.budgetBelowFloor !== undefined && value.budgetBelowFloor !== true)) return undefined;
  return {
    bytes: value.bytes as number,
    budget: value.budget as number,
    steps: value.steps as number,
    instructionBytes: value.instructionBytes as number,
    ...(value.unlisted !== undefined ? { unlisted: value.unlisted as number } : {}),
    ...(value.withoutInput !== undefined ? { withoutInput: value.withoutInput as number } : {}),
    ...(value.inputTooLarge !== undefined ? { inputTooLarge: value.inputTooLarge as number } : {}),
    ...(value.overBudget === true ? { overBudget: true as const } : {}),
    ...(value.budgetBelowFloor === true ? { budgetBelowFloor: true as const } : {})
  };
}

export function evidenceStepAnswerability(value: unknown): AutomationStudioLlmEvidenceLoopAnswerability | undefined {
  if (!isStepRecord(value) || !hasExactFields(value, ANSWERABILITY_FIELDS)
    || typeof value.recordsRequested !== "boolean"
    || typeof value.recordProducerPresent !== "boolean"
    || typeof value.recordStorePresent !== "boolean"
    || (value.issueCode !== undefined && value.issueCode !== "bootstrap.cannot_answer_instruction")) return undefined;
  return {
    recordsRequested: value.recordsRequested,
    recordProducerPresent: value.recordProducerPresent,
    recordStorePresent: value.recordStorePresent,
    ...(value.issueCode !== undefined ? { issueCode: value.issueCode } : {})
  };
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

/**
 * A step's refused amendments, read back: a non-empty list of `{ step, reason }`
 * and nothing else, each step inside the bound and each reason one the draft
 * actually has. `null` for anything else -- an unknown reason is a record Core
 * did not write, and a list this long or this shaped is not one it published.
 */
function parseStepAmendmentRefusals(value: unknown): StepAmendmentRefusal[] | null {
  if (!Array.isArray(value) || !value.length || value.length > MAX_EVIDENCE_STEP_AMENDMENT_REFUSALS) return null;
  const refusals: StepAmendmentRefusal[] = [];
  for (const refusal of value) {
    if (!isStepRecord(refusal) || !hasExactFields(refusal, ["step", "reason", "nodeId"])
      || !isAmendmentRefusalStep(refusal.step)
      || typeof refusal.reason !== "string" || !Object.hasOwn(EVIDENCE_STEP_AMENDMENT_REFUSAL_REASONS, refusal.reason)
      || (refusal.nodeId !== undefined && (typeof refusal.nodeId !== "string" || !EVIDENCE_STEP_ID.test(refusal.nodeId)))) return null;
    refusals.push({ step: refusal.step as number, reason: refusal.reason as AutomationStudioFlowDraftAmendmentRefusal["reason"], ...(refusal.nodeId !== undefined ? { nodeId: refusal.nodeId as string } : {}) });
  }
  return refusals;
}

/** The flat refusal codes, read back: `null` for anything that is not a short list of them. */
function parseStepAmendmentRefusalCodes(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.length || value.length > MAX_EVIDENCE_STEP_AMENDMENT_REFUSALS) return null;
  return value.every((code) => typeof code === "string" && EVIDENCE_STEP_AMENDMENT_REFUSAL_CODE.test(code)) ? [...value] as string[] : null;
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
