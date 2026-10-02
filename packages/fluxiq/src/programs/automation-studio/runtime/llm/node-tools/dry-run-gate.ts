// The gate the loop asks before it accepts a result: has this draft replayed?
//
// The rule and the verdict are in `../../flow-draft/dry-run.ts`; the replay
// itself is in `./replay-draft.ts`; this is the piece between them that the
// loop holds -- what has already replayed clean, which steps the model has
// already been told did not replay, and what a refusal does to the evidence the
// next decision sees.
//
// It is a closure over the loop's own bookkeeping rather than a function the
// loop calls with everything, because three of those things are the loop's and
// must stay so: the evidence list, its accounting, and the epochs that
// decide whether a request has already been answered. What it takes instead is
// the four small doors onto them, so the loop's file keeps the loop.

import type { JsonValue } from "../../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_PAGE_TOOL_ID,
  AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID,
  automationStudioFlowDraftConditionalStepIds,
  automationStudioFlowDraftDryRunFeedback,
  automationStudioFlowDraftDryRunIssueCodes,
  automationStudioFlowDraftDryRunVerdict,
  automationStudioFlowDraftReplayable,
  automationStudioFlowDraftReplayOutcomeKey,
  automationStudioFlowDraftReplaySignature,
  automationStudioFlowDraftSometimesPresentStepIds,
  automationStudioFlowDraftStepId,
  automationStudioFlowDraftWithheldStepIds,
  type AutomationStudioFlowDraftDryRun,
  type AutomationStudioFlowDraftStep
} from "../../flow-draft/index.ts";
import { replayAutomationStudioFlowDraft, type AutomationStudioFlowDraftReplayInput } from "./replay-draft.ts";

/**
 * What a gate answers.
 *
 * `undefined` is the only way past it: either the draft replayed clean, or it
 * is not a draft this gate applies to. The other two each end or interrupt
 * the completion the loop was about to accept.
 */
export type AutomationStudioFlowDraftDryRunRefusal = "cancelled" | { issueCodes: readonly string[] };

/** What one step's replay answered: its evidence, as the domain gave it. */
export type AutomationStudioFlowDraftTestObservation = { step: number; stepId?: string; resultCode?: string; evidence: JsonValue };

/**
 * What a passing test observed, for a judge of what the build actually did.
 *
 * `verdict` is the replay it passed on; `observations` what that replay's
 * steps answered; `reused` that the answer came from an earlier replay of the
 * same draft rather than a new one.
 */
export type AutomationStudioFlowDraftTestReport = {
  verdict: AutomationStudioFlowDraftDryRun;
  observations: AutomationStudioFlowDraftTestObservation[];
  reused: boolean;
};

export type AutomationStudioFlowDraftDryRunGateInput = {
  /** Off for a caller that turned the dry run off, or that accrues no draft. */
  enabled: boolean;
  /** The loop's own list, read as it stands and written back onto. */
  steps: AutomationStudioFlowDraftStep[];
  executeTool: AutomationStudioFlowDraftReplayInput["executeTool"];
  /** Count a value in the loop's accounting. A count, never a limit. */
  accountEvidence(value: JsonValue): number;
  /** Put an entry in the evidence the next decision is shown. */
  showEvidence(entry: { callId: string; toolId: string; value: JsonValue }): void;
  /**
   * Tell the loop the target moved.
   *
   * A replay acts on the world, so nothing the loop is holding is still the
   * newest look at it and no earlier request is still answered by what it has.
   */
  targetMoved(): void;
  /**
   * Tell the loop this answer passed on an earlier replay of the same draft
   * instead of replaying -- a clean one, or a refused one judged again once
   * its failing steps were marked as not always run -- so a record of the
   * attempt can say so rather than reading as a dry run that never ran.
   */
  reusedClean?(): void;
  /**
   * What the test observed, on every pass -- a new clean replay, one that
   * passed once a sometimes-present step was made optional, or an earlier
   * replay reused -- and never on a refusal or a draft the gate does not apply to.
   */
  observed?(report: AutomationStudioFlowDraftTestReport): void;
  signal?: AbortSignal;
};

/** How many times one unchanged draft is replayed before its refusal is judged from what those replays found. */
const MAX_REPLAYS_OF_ONE_DRAFT = 2;

/** The gate, as the loop's own `dryRun()`. */
export function automationStudioFlowDraftDryRunGate(
  input: AutomationStudioFlowDraftDryRunGateInput
): () => Promise<AutomationStudioFlowDraftDryRunRefusal | undefined> {
  let attempts = 0;
  // What a clean verdict was a verdict about. A draft edited since then has not
  // replayed clean, and a draft completed twice unchanged is not replayed twice.
  // Only ever set by a replay whose verdict had nothing blocking (every step
  // replayed, or is one the Flow would not always run), so an unconditional
  // step that did not replay is never carried past a later completion on it.
  let cleanSignature: string | undefined;
  // What the replay that made `cleanSignature` clean passed on and observed,
  // so a reuse of it reports what that replay saw.
  let clean: { verdict: AutomationStudioFlowDraftDryRun; observations: AutomationStudioFlowDraftTestObservation[] } | undefined;
  // Steps an earlier dry run already told the model did not replay. It marks
  // their feedback lines `again` and nothing more. It used to let an
  // unreproducible step through the second time it was reported, and live
  // runs 18, 21 and 33 were accepted or passed a dry run that way with a step
  // that did not replay (`../../flow-draft/dry-run.ts`).
  const asked = new Set<string>();
  // What the last refused replay found, the draft it was a replay of, and how
  // many times that draft has been replayed. An unchanged draft is replayed
  // twice -- a step can fail once on a page still settling and replay the next
  // time -- and after that its outcomes are judged again rather than replayed
  // again: lane t195's run `run-muntu7in-e3dd1972` completed one unchanged draft
  // fourteen times and spent 401 of its 537 seconds replaying it, then ran out
  // of time. Judged, not repeated, because what may block can change between
  // two completions of the same steps even though the steps themselves did
  // not: a step marked optional, or only_if on a check, no longer blocks, and
  // routing is not part of the signature. Insisting changes nothing: a step
  // that did not replay blocks again (`../../flow-draft/dry-run.ts`).
  let refused: { signature: string; verdict: AutomationStudioFlowDraftDryRun; observations: AutomationStudioFlowDraftTestObservation[]; replays: number } | undefined;
  const passed = (verdict: AutomationStudioFlowDraftDryRun, observations: AutomationStudioFlowDraftTestObservation[], reused: boolean): undefined => {
    clean = { verdict, observations };
    input.observed?.({ verdict, observations, reused });
    return undefined;
  };
  return async () => {
    if (!input.enabled || !automationStudioFlowDraftReplayable(input.steps)) return undefined;
    const signature = automationStudioFlowDraftReplaySignature(input.steps);
    if (signature === cleanSignature) {
      input.reusedClean?.();
      return clean ? passed(clean.verdict, clean.observations, true) : undefined;
    }
    if (refused?.signature === signature && refused.replays >= MAX_REPLAYS_OF_ONE_DRAFT) {
      const again = automationStudioFlowDraftDryRunVerdict({
        attempt: refused.verdict.attempt,
        reset: refused.verdict.reset,
        outcomes: refused.verdict.outcomes,
        conditional: new Set([...automationStudioFlowDraftConditionalStepIds(input.steps), ...automationStudioFlowDraftWithheldStepIds(refused.verdict.outcomes)])
      });
      if (again.ok) {
        // Passed on an earlier replay's outcomes, not a new one: recorded as
        // such, so the attempt does not read as a dry run that never ran.
        cleanSignature = signature;
        input.reusedClean?.();
        return passed(again, refused.observations, true);
      }
      const feedback = automationStudioFlowDraftDryRunFeedback(again, asked, input.steps);
      input.accountEvidence(feedback);
      input.showEvidence({ callId: `${AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID}.${attempts}.again`, toolId: AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID, value: feedback });
      return { issueCodes: automationStudioFlowDraftDryRunIssueCodes(again) };
    }
    attempts += 1;
    let replay: Awaited<ReturnType<typeof replayAutomationStudioFlowDraft>>;
    try {
      replay = await replayAutomationStudioFlowDraft({
        steps: input.steps,
        attempt: attempts,
        executeTool: input.executeTool,
        ...(input.signal ? { signal: input.signal } : {})
      });
    } catch {
      // Only a cancellation or a raised permission request reaches here, and
      // both end the run: the caller reads which it was from the signal.
      return "cancelled";
    }
    // The verdict goes onto the steps it is about, so the record of the draft
    // having been run as a Flow travels with the draft rather than living only
    // in a refusal.
    for (const outcome of replay.verdict.outcomes) {
      const step = input.steps.find((candidate) => candidate.position === outcome.step);
      if (step) step.replayed = { ...outcome };
    }
    input.targetMoved();
    if (replay.verdict.ok) {
      cleanSignature = signature;
      return passed(replay.verdict, replay.observations, false);
    }
    // A step the replay found missing and proved the Flow did not need -- a
    // banner the site remembers having been answered -- is made optional rather
    // than refused, when that is all that stood in the way
    // (`../../flow-draft/sometimes-present.ts`).
    const optional = madeOptional(input.steps, replay.verdict);
    if (optional) {
      cleanSignature = signature;
      return passed(optional, replay.observations, false);
    }
    refused = { signature, verdict: replay.verdict, observations: replay.observations, replays: refused?.signature === signature ? refused.replays + 1 : 1 };
    // The target as it was when the replay broke, which is what a correction
    // has to be made from, and then the verdict that says what to do about it.
    if (replay.evidence) {
      input.accountEvidence(replay.evidence.value);
      input.showEvidence({ callId: replay.evidence.callId, toolId: AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_PAGE_TOOL_ID, value: replay.evidence.value });
    }
    const feedback = automationStudioFlowDraftDryRunFeedback(replay.verdict, asked, input.steps);
    for (const outcome of replay.verdict.outcomes) {
      if (outcome.status !== "replayed") asked.add(automationStudioFlowDraftReplayOutcomeKey(outcome));
    }
    input.accountEvidence(feedback);
    input.showEvidence({ callId: `${AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID}.${attempts}`, toolId: AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID, value: feedback });
    return { issueCodes: automationStudioFlowDraftDryRunIssueCodes(replay.verdict) };
  };
}

/**
 * Makes optional the steps this refused replay proved are only sometimes there,
 * and answers the verdict that passes once they are, when that leaves nothing in
 * the way. Changes nothing, and answers `undefined`, when it does not: a step is made optional only by a replay the Flow then passes, so a
 * refusal the model must answer is never half-answered for it.
 */
function madeOptional(steps: AutomationStudioFlowDraftStep[], verdict: AutomationStudioFlowDraftDryRun): AutomationStudioFlowDraftDryRun | undefined {
  const sometimesPresent = automationStudioFlowDraftSometimesPresentStepIds({ steps, verdict });
  if (!sometimesPresent.size) return undefined;
  const judged = automationStudioFlowDraftDryRunVerdict({
    attempt: verdict.attempt,
    reset: verdict.reset,
    outcomes: verdict.outcomes,
    conditional: new Set([...automationStudioFlowDraftConditionalStepIds(steps), ...automationStudioFlowDraftWithheldStepIds(verdict.outcomes), ...sometimesPresent])
  });
  if (!judged.ok) return undefined;
  for (const step of steps) {
    if (!sometimesPresent.has(automationStudioFlowDraftStepId(step))) continue;
    step.routing = { kind: "optional" };
    if (step.replayed) step.replayed = { ...step.replayed, madeOptional: true };
  }
  return judged;
}
