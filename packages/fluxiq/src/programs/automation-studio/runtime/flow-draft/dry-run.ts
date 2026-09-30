// Replaying the draft before it may be proposed, and the verdict that decides.
//
// **The defect this closes.** A build explored, every action it took came back
// `succeeded`, and it proposed a Flow made of exactly those actions -- which is
// the whole design, and it is still not enough. A live build did that and the
// Flow's extraction then read **nothing** where the exploration had read
// sixteen rows (`run-mudavyub-d34e3c9b`); another built a Flow that needed a
// paid repair the first time it ran (`run-muddtosq-b92a4d5c`). Both were
// proposed with nothing wrong in the record, because "each step worked when I
// took it" and "these steps work as a Flow, from the beginning, in order" are
// different claims, and only the second one is what ships.
//
// So the draft is run again before it may be proposed: the target is put back
// the way the first step found it, every step the draft proposes is run in
// order with the argument the Flow will run it with, and **no model is
// attached** -- the loop makes not one provider call for any of it. That is the
// same proof the Lab takes of a repair (`flow-lane/repair/replay-repair.ts`),
// taken while the model is still there to act on it.
//
// **The rule.** A proposal is refused until the draft has replayed clean. The
// refusal is an ordinary issue the loop already knows how to feed back, so the
// model amends the draft and finishes again rather than the build dying.
//
// **What Core knows and what it does not.** Core knows which steps the draft
// proposes, in which order, and what each ran with; it knows nothing about
// targets, pages or state. So the two things a replay needs from the world --
// putting the target back, and saying whether a step reproduced what it did --
// are the caller's, carried on the step opaquely (`replay` on
// `AutomationStudioFlowDraftStep`) and answered in the closed vocabulary below.
//
// **Three ways a step can fail to replay, and they are not the same failure.**
//
//   failed          -- it did not run. The Flow would not run it either.
//   changed         -- it ran and produced nothing where it produced something.
//                      The step before it left the target somewhere else.
//   unreproducible  -- the reset could not put back what it needed, because the
//                      step's own effect is remembered beyond the page: a
//                      consent banner answered once stays answered. That is not
//                      a fault in the step, and refusing it outright would push
//                      the model to delete exactly the dismissals round 1 lost.
//                      So it is a question, asked once: told about it, a model
//                      that finishes again with the step kept has answered it,
//                      and the step no longer blocks.

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "./step.ts";
import { automationStudioFlowDraftStepIsProposed } from "./step.ts";

/** The entry a dry run's verdict is shown to the model under. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID = "core.dry_run";

/** The entry the page a replay broke on is shown under, beside the verdict. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_PAGE_TOOL_ID = "core.dry_run.page";

/** The issue a refused dry run is counted under, beside each step's own code. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_ISSUE_CODE = "llm_evidence_loop.dry_run_refused";

/** How one step of the draft answered when it was run again. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_STATUSES = ["replayed", "failed", "changed", "unreproducible"] as const;

export type AutomationStudioFlowDraftReplayStatus = (typeof AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_STATUSES)[number];

/**
 * What a step carries so it can be run again. Both fields are the caller's own
 * and Core reads neither.
 *
 * `from` is how to put the target back the way this step found it; only the
 * first proposed step's is ever used, because that is where a replay starts.
 * `produced` is what the step produced, handed back to the caller on the replay
 * so it -- not Core -- can say whether the replay reproduced it.
 */
export type AutomationStudioFlowDraftStepReplay = { from?: JsonObject; produced?: JsonObject };

/** One step's answer to being run again. */
export type AutomationStudioFlowDraftReplayOutcome = {
  /** The step's position in the draft when the replay ran. */
  step: number;
  /**
   * The step's own name, which a position stops being the moment the draft is
   * reordered (`./routing.ts`). Carried so a verdict can be read against what
   * the step says about when it runs.
   */
  stepId?: string;
  /** What was run, under the caller's own name for it. */
  actionId: string;
  status: AutomationStudioFlowDraftReplayStatus;
  /** The caller's code for the answer, carried and never read. */
  resultCode?: string;
};

/** One whole replay of the draft. */
export type AutomationStudioFlowDraftDryRun = {
  /** 1 for the first, so a reader counts them the way an operator would. */
  attempt: number;
  /** Whether the target could be put back at all. A reset that failed replays nothing. */
  reset: "ok" | "failed";
  outcomes: AutomationStudioFlowDraftReplayOutcome[];
  /** Provider calls this replay cost. Always zero: no model is attached. */
  providerCalls: 0;
  /** Whether the draft may be proposed on this verdict alone. */
  ok: boolean;
};

/**
 * Whether this draft can be dry-run at all.
 *
 * Every proposed step has to say what it would be run again with, and the first
 * one has to say how to get back to where it started. A draft that says neither
 * is a caller that does not replay -- an older host, a domain whose actions are
 * not repeatable -- and the gate simply does not apply to it, rather than
 * refusing every build it makes.
 */
export function automationStudioFlowDraftReplayable(steps: readonly AutomationStudioFlowDraftStep[]): boolean {
  const proposed = steps.filter(automationStudioFlowDraftStepIsProposed);
  if (!proposed.length) return false;
  if (!proposed.every((step) => step.ranWith !== undefined && step.replay !== undefined)) return false;
  return automationStudioFlowDraftReplayFrom(steps) !== undefined;
}

/** Where a replay of this draft starts: what the first proposed step found. */
export function automationStudioFlowDraftReplayFrom(steps: readonly AutomationStudioFlowDraftStep[]): JsonObject | undefined {
  return steps.filter(automationStudioFlowDraftStepIsProposed)[0]?.replay?.from;
}

/**
 * What a clean verdict is a verdict *about*: the proposed steps and the
 * arguments they would run with, in order.
 *
 * A draft that has changed since it replayed clean has not replayed clean, so
 * the signature is what a second completion is compared against. What is in it
 * is what changes the Flow -- which steps, in what order, with what argument --
 * and nothing that changes without the Flow changing, such as the iteration a
 * step was decided in or the call that ran it.
 */
export function automationStudioFlowDraftReplaySignature(steps: readonly AutomationStudioFlowDraftStep[]): string {
  return JSON.stringify(steps.filter(automationStudioFlowDraftStepIsProposed).map((step) => [step.actionId, step.ranWith ?? step.input]));
}

/**
 * The verdict one replay makes.
 *
 * `asked` is the steps the model has already been told were unreproducible, by
 * `<position>:<actionId>`. A step in it no longer blocks: it was put to the
 * model, and finishing again with it kept is the answer.
 *
 * `conditional` is the ids of the steps a Flow built from this draft would not
 * always run (`./routing.ts`). A replay runs every proposed step once, in
 * order, so a step the Flow takes only in some situations may legitimately not
 * run in the situation the replay is in -- and refusing the proposal for that
 * would refuse exactly the Flow the model was asked to write. This is the
 * honest closure of the question `unreproducible` could only ask: a dismissal
 * the site remembers stops being a question the model answers by insisting, and
 * becomes a step the Flow itself handles.
 */
export function automationStudioFlowDraftDryRunVerdict(input: {
  attempt: number;
  reset: "ok" | "failed";
  outcomes: readonly AutomationStudioFlowDraftReplayOutcome[];
  asked: ReadonlySet<string>;
  conditional?: ReadonlySet<string>;
}): AutomationStudioFlowDraftDryRun {
  const outcomes = input.outcomes.map((outcome) => ({ ...outcome }));
  const conditional = input.conditional ?? new Set<string>();
  const blocking = outcomes.filter((outcome) => !(outcome.stepId !== undefined && conditional.has(outcome.stepId))
    && automationStudioFlowDraftReplayOutcomeBlocks(outcome, input.asked));
  return {
    attempt: input.attempt,
    reset: input.reset,
    outcomes,
    providerCalls: 0,
    ok: input.reset === "ok" && !blocking.length
  };
}

/** Whether one outcome stands in the way of a proposal. */
export function automationStudioFlowDraftReplayOutcomeBlocks(
  outcome: AutomationStudioFlowDraftReplayOutcome,
  asked: ReadonlySet<string>
): boolean {
  if (outcome.status === "replayed") return false;
  if (outcome.status !== "unreproducible") return true;
  return !asked.has(automationStudioFlowDraftReplayOutcomeKey(outcome));
}

/** How one step is named in the set of questions already put to the model. */
export function automationStudioFlowDraftReplayOutcomeKey(outcome: AutomationStudioFlowDraftReplayOutcome): string {
  return `${outcome.step}:${outcome.actionId}`;
}

/** The issue codes a refused dry run is counted and fed back under. */
export function automationStudioFlowDraftDryRunIssueCodes(verdict: AutomationStudioFlowDraftDryRun): string[] {
  const codes = verdict.outcomes
    .filter((outcome) => outcome.status !== "replayed")
    .map((outcome) => outcome.resultCode ?? `core.replay.${outcome.status}`);
  return [...new Set([
    AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_ISSUE_CODE,
    ...(verdict.reset === "failed" ? ["core.replay.reset_failed"] : []),
    ...codes
  ])];
}

const DRY_RUN_INSTRUCTION = "Your draft was run again from the beginning with no model attached, the way the finished Flow will run: the target was put back the way your first step found it, and every step you kept was run in order with the argument the Flow will use. "
  + "A step that does not replay is a step the Flow cannot rely on, so the Flow is not proposed until they all do. "
  + "failed: the step did not run this time. Rerun it with a corrected argument (amend_draft rerun), or run the step it needed first and keep that one too. "
  + "changed: it ran, and produced nothing where it produced something before -- almost always the step before it left the target somewhere else, so correct the order or the earlier step rather than this one. "
  + "unreproducible: putting the target back could not undo this step's own effect, which is what happens when a site remembers it -- a consent banner answered once stays answered. "
  // The honest answer to a step that is not always there. Before routing
  // existed the only answers were "insist" or "delete", and a live build's
  // dismissals were waved through unchecked under the first. Named here rather
  // than only in the draft entry because this refusal is where the model is
  // actually looking at the step that needs it.
  + "A step that is not always needed is not a step to insist on: say so instead, with amend_draft optional, and the Flow carries on when it is not there. Where you ran a check first, amend_draft only_if on this step runs it only when that check succeeded. "
  + "If the Flow truly does need it on every fresh start, finish again with it kept and it will be accepted; drop it only if the Flow does not need it at all. "
  + "The target now stands where the replay ended.";

/** What the model is shown of a refused dry run: the verdict, and what to do. */
export function automationStudioFlowDraftDryRunFeedback(verdict: AutomationStudioFlowDraftDryRun): JsonObject {
  return {
    ok: false,
    code: AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_ISSUE_CODE,
    attempt: verdict.attempt,
    reset: verdict.reset,
    steps: verdict.outcomes.map((outcome) => ({
      step: outcome.step,
      actionId: outcome.actionId,
      replayed: outcome.status,
      ...(outcome.resultCode ? { resultCode: outcome.resultCode } : {})
    })),
    instruction: DRY_RUN_INSTRUCTION
  };
}
