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
//
// **The rule it holds (user, 2026-10-02).** A Flow is finished only after a
// run of the whole Flow from its start was judged to do what was asked, on the
// Flow as it finally stands; any edit to the Flow after that run needs another
// full run. Three things here follow from it:
//
//   - Every verdict is keyed on the Flow signature
//     (`../../flow-draft/flow-signature.ts`), routing and settings included,
//     not on the replay signature, which leaves routing out. Before, a step
//     marked optional after two refused replays passed on those replays'
//     outcomes judged again, so a Flow that had never run as written was
//     accepted as tested. Marking a step optional changes the Flow; the
//     changed Flow is run.
//   - The report a passing test hands the judge carries that signature, so a
//     verdict says which Flow version it was about.
//   - A Flow holding a step the test cannot run -- carried from an earlier Flow
//     and never run in this build, or left with nothing to run it again with --
//     is refused `llm_evidence_loop.full_run_required`
//     (`../../flow-draft/full-run-required.ts`). Before, such a draft was "not
//     a draft this gate applies to": it was never tested, the judge answered
//     `unknown` or a yes about no test, and a re-authored Flow was approved and
//     applied before anything ran it whole.
//   - A written step the test never came to -- inside a repeat whose list had
//     no rows in the test, so it ran zero times, or a repeat the test could not
//     walk row by row, where it did not pass on the explored row (t252,
//     `./replay-span.ts`) -- is refused the same way, as `not_reached`, once the
//     replay has run: a written step never ran in the build, so nothing else
//     shows it works.
//
// **A refused Flow completed again unchanged is told so.** An unchanged Flow
// is replayed twice -- a step can fail once on a page still settling -- and
// then refused from those replays without a third. Each refusal of a Flow
// whose signature equals the last refused one carries one more line,
// `unchanged`: nothing changed since the last test, whether it was run again
// and failed the same way or was not run again, and which steps to change. In
// live run `run-murwdp4f-35f976d2` (0071) the model answered a refusal with
// `complete` on the unchanged draft ("the Flow replays") and was shown the
// identical verdict with nothing saying the Flow had not changed.

import type { JsonValue } from "../../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_PAGE_TOOL_ID,
  AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID,
  AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE,
  automationStudioFlowDraftConditionalStepIds,
  automationStudioFlowDraftDryRunFeedback,
  automationStudioFlowDraftDryRunIssueCodes,
  automationStudioFlowDraftDryRunVerdict,
  automationStudioFlowDraftFlowSignature,
  automationStudioFlowDraftFullRunRequiredFeedback,
  automationStudioFlowDraftReplayable,
  automationStudioFlowDraftReplayFrom,
  automationStudioFlowDraftReplayOutcomeBlocks,
  automationStudioFlowDraftReplayOutcomeKey,
  automationStudioFlowDraftSometimesPresentStepIds,
  automationStudioFlowDraftStepId,
  automationStudioFlowDraftStepIsProposed,
  automationStudioFlowDraftWithheldStepIds,
  type AutomationStudioFlowDraftDryRun,
  type AutomationStudioFlowDraftStep,
  type AutomationStudioFlowDraftUnrunnableWord
} from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepCarried } from "./draft-from-flow.ts";
import { automationStudioFlowBootstrapDraftStepIsWritable } from "./draft-step.ts";
import { replayAutomationStudioFlowDraft, type AutomationStudioFlowDraftReplayInput } from "./replay-draft.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_UNRESOLVED_BINDING_CODE, type AutomationStudioFlowDraftReplayObservation } from "./replay-span.ts";

/**
 * What a gate answers.
 *
 * `undefined` is the only way past it: either the draft replayed clean, or it
 * is not a draft this gate applies to. The other two each end or interrupt
 * the completion the loop was about to accept.
 */
export type AutomationStudioFlowDraftDryRunRefusal = "cancelled" | { issueCodes: readonly string[] };

/** What one step's replay answered: its evidence, as the domain gave it; a pass of a repeat says which, of how many. */
export type AutomationStudioFlowDraftTestObservation = AutomationStudioFlowDraftReplayObservation;

/**
 * The page a passing test ended on, as the domain's view of it, and the step it
 * was taken after. Structurally the result verification's
 * `AutomationStudioResultEndView`, declared here so the loop does not import it.
 */
export type AutomationStudioFlowDraftTestEndView = { after?: number | string; view: JsonValue };

/**
 * What a passing test observed, for a judge of what the build actually did.
 *
 * `verdict` is the replay it passed on; `observations` what that replay's
 * steps answered; `reused` that the answer came from an earlier replay of the
 * same Flow rather than a new one; `signature` the Flow signature of the draft
 * that test ran (`../../flow-draft/flow-signature.ts`) -- for a pass where the
 * replay itself made a sometimes-present step optional, the Flow with that step
 * optional, because the run that proved it is a run of that Flow. A verdict on
 * the test is a verdict on that Flow version and no other.
 */
export type AutomationStudioFlowDraftTestReport = {
  verdict: AutomationStudioFlowDraftDryRun;
  observations: AutomationStudioFlowDraftTestObservation[];
  reused: boolean;
  signature: string;
  /**
   * The page the test ended on, looked at right after its replay passed
   * (`AutomationStudioFlowDraftDryRunGateInput.endView`); a reuse reports the
   * replay's own. Absent when the caller offers no look, or it failed or saw
   * nothing (t174-w89; run `run-murwd8le-79e735a8` Cause 7).
   */
  endView?: AutomationStudioFlowDraftTestEndView;
};

export type AutomationStudioFlowDraftDryRunGateInput = {
  /** Off for a caller that turned the dry run off, or that accrues no draft. */
  enabled: boolean;
  /**
   * The caller authors a Flow that is finished only once it has run whole and
   * been judged (a build; `AutomationStudioLlmEvidenceLoopInput.fullRunRequired`):
   * a completion whose Flow the test cannot run whole is refused, never passed
   * untested. Off, only steps carried from an earlier Flow are refused -- a
   * loop that does not author a Flow (the recovery ladder's exploration) still
   * finishes with whatever it ran.
   */
  requireRunnable?: boolean;
  /**
   * The caller offers the node library (`core.run_node`), so the Flow it
   * authors is written from its steps only when every step went through it
   * (`./draft-step.ts`). With `requireRunnable`, a step taken through another
   * tool is refused `not_a_library_step`: it would send the Flow to the plan
   * the reply wrote out, which never ran, so the test would have run one Flow
   * and the judge's yes would be stored on another. A caller that offers no
   * library -- a host whose actions are not nodes -- has only the reply's plan,
   * and is not refused for it (t244; stated in the lane report's open items).
   */
  requireLibrarySteps?: boolean;
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
   * Tell the loop this answer passed on an earlier clean replay of the same
   * Flow instead of replaying, so a record of the attempt can say so rather
   * than reading as a dry run that never ran.
   */
  reusedClean?(): void;
  /**
   * What the test observed, on every pass -- a new clean replay, one that
   * passed once a sometimes-present step was made optional, or an earlier
   * clean replay of the same Flow reused -- and never on a refusal or a draft
   * the gate does not apply to.
   */
  observed?(report: AutomationStudioFlowDraftTestReport): void;
  /**
   * The ids of the instruction's acts the build reads as lasting, asked for
   * only when a replay is about to run -- the first time, the build's one
   * instruction read -- and handed to the replay, which checks a step claiming
   * one rather than running it again (`./replay-draft.ts`; run
   * `run-murwd8le-79e735a8` Cause 3: Add to cart, declared `[]`, was pressed
   * again by every test). A build whose read failed answers an empty set, and
   * its steps last by their declarations alone, as before.
   */
  lastingActs?: (() => Promise<ReadonlySet<string>>) | undefined;
  /**
   * One look at the page, taken right after a replay passes and before
   * anything else moves it, for the judge of the test
   * (`AutomationStudioFlowDraftTestReport.endView`). Asked only where the test
   * is `observed`. A look that fails or sees nothing leaves the report without
   * a page; it never fails the test.
   */
  endView?: ((request: { callId: string; after?: number; signal?: AbortSignal }) => Promise<AutomationStudioFlowDraftTestEndView | undefined>) | undefined;
  /** The node each step names, handed to the replay so a repeat runs once per row (`./replay-draft.ts`). */
  nodeOf?: AutomationStudioFlowDraftReplayInput["nodeOf"];
  signal?: AbortSignal;
};

/** How many times one unchanged Flow is replayed before its refusal is repeated from what those replays found. */
const MAX_REPLAYS_OF_ONE_DRAFT = 2;

/** The gate, as the loop's own `dryRun()`. */
export function automationStudioFlowDraftDryRunGate(
  input: AutomationStudioFlowDraftDryRunGateInput
): () => Promise<AutomationStudioFlowDraftDryRunRefusal | undefined> {
  let attempts = 0;
  // How many completions were refused for steps that never ran in this build,
  // which names each refusal's entry apart from a replay's.
  let unrunRefusals = 0;
  // The Flow a clean verdict was a verdict about. A Flow edited since then --
  // its steps, their arguments, their routing or settings -- has not replayed
  // clean, and a Flow completed twice unchanged is not replayed twice. Only
  // ever set by a replay whose verdict had nothing blocking (every step
  // replayed, or is one the Flow would not always run), so an unconditional
  // step that did not replay is never carried past a later completion on it.
  let cleanSignature: string | undefined;
  // What the replay that made `cleanSignature` clean passed on and observed,
  // so a reuse of it reports what that replay saw.
  let clean: { verdict: AutomationStudioFlowDraftDryRun; observations: AutomationStudioFlowDraftTestObservation[]; endView?: AutomationStudioFlowDraftTestEndView | undefined } | undefined;
  // Steps an earlier dry run already told the model did not replay. It marks
  // their feedback lines `again` and nothing more. It used to let an
  // unreproducible step through the second time it was reported, and live
  // runs 18, 21 and 33 were accepted or passed a dry run that way with a step
  // that did not replay (`../../flow-draft/dry-run.ts`).
  const asked = new Set<string>();
  // What the last refused replay found, the Flow it was a replay of, and how
  // many times that Flow has been replayed. An unchanged Flow is replayed
  // twice -- a step can fail once on a page still settling and replay the next
  // time -- and after that it is refused again from what those replays found
  // rather than replayed again: lane t195's run `run-muntu7in-e3dd1972`
  // completed one unchanged draft fourteen times and spent 401 of its 537
  // seconds replaying it, then ran out of time. It is never *passed* from
  // those outcomes: routing is part of the Flow signature, so a step marked
  // optional or only_if since is a changed Flow, and a changed Flow is run
  // (user, 2026-10-02). Insisting changes nothing: a step that did not replay
  // blocks again (`../../flow-draft/dry-run.ts`).
  let refused: { signature: string; verdict: AutomationStudioFlowDraftDryRun; replays: number } | undefined;
  const passed = (verdict: AutomationStudioFlowDraftDryRun, observations: AutomationStudioFlowDraftTestObservation[], reused: boolean, signature: string, endView: AutomationStudioFlowDraftTestEndView | undefined): undefined => {
    clean = { verdict, observations, endView };
    input.observed?.({ verdict, observations, reused, signature, ...(endView ? { endView } : {}) });
    return undefined;
  };
  // The page right after a replay passed, before anything else can move it.
  const lookedAt = async (verdict: AutomationStudioFlowDraftDryRun): Promise<AutomationStudioFlowDraftTestEndView | undefined> => {
    if (!input.endView || !input.observed) return undefined;
    const after = verdict.outcomes.at(-1)?.step;
    const looked = await input.endView({ callId: `${AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID}.${attempts}.end_view`, ...(after === undefined ? {} : { after }), ...(input.signal ? { signal: input.signal } : {}) })
      .then((endView) => ({ endView }), (error: unknown) => ({ unread: error }));
    // A look that failed is no page for the judge, and the test it followed still passed.
    return "endView" in looked ? looked.endView : undefined;
  };
  // The build's lasting acts, asked for once and only when a replay first needs them. A read that
  // fails answers no acts (`instructedLastingActs`); a provider that throws is a fault, and ends the build.
  let lasting: Promise<ReadonlySet<string>> | undefined;
  const lastingActs = (): Promise<ReadonlySet<string>> | undefined => input.lastingActs && (lasting ??= input.lastingActs());
  // The steps the model is told the test cannot run, with why, as one refusal.
  const refuseUnrunnable = (steps: readonly { position: number; actionId: string; word: AutomationStudioFlowDraftUnrunnableWord }[]): AutomationStudioFlowDraftDryRunRefusal => {
    unrunRefusals += 1;
    const feedback = automationStudioFlowDraftFullRunRequiredFeedback(steps);
    input.accountEvidence(feedback);
    input.showEvidence({ callId: `${AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID}.unrun.${unrunRefusals}`, toolId: AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID, value: feedback });
    return { issueCodes: [AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE] };
  };
  return async () => {
    if (!input.enabled) return undefined;
    // Steps the test cannot run: one carried from an earlier Flow that never
    // ran in this build, one whose run left nothing to run it again with, or a
    // first step with nothing to put the target back where the Flow starts. A
    // Flow holding one cannot be tested whole, so it cannot be finished, and
    // the model is told which and how to make them runnable now rather than
    // after a judge was paid to read a test that never ran
    // (`../../flow-draft/full-run-required.ts`). Until t244 such a draft was
    // "not a draft this gate applies to" and passed untested. Nothing is
    // replayed, so the target has not moved and nothing was observed.
    const proposed = input.steps.filter(automationStudioFlowDraftStepIsProposed);
    const cannotRun = proposed.filter((step) => step.ranWith === undefined || step.replay === undefined);
    const noStart = !cannotRun.length && proposed.length > 0 && automationStudioFlowDraftReplayFrom(input.steps) === undefined;
    // Only a Flow-authoring caller is refused for steps it cannot run again, or
    // for a Flow with no step that ran in this build (one the model wrote out
    // whole in its reply), which is refused naming no step. Carried steps are
    // refused whoever asks: only a build carries them.
    const offLibrary = input.requireRunnable && input.requireLibrarySteps ? proposed.filter((step) => !automationStudioFlowBootstrapDraftStepIsWritable(step)) : [];
    const notRun = input.requireRunnable
      ? [...new Set([...(noStart ? proposed.slice(0, 1) : cannotRun), ...offLibrary])].sort((a, b) => a.position - b.position)
      : cannotRun.filter(automationStudioFlowDraftStepCarried);
    if (notRun.length || (input.requireRunnable && !proposed.length)) {
      return refuseUnrunnable(notRun.map((step) => ({ position: step.position, actionId: step.actionId, word: unrunnableWord(step, offLibrary) })));
    }
    if (!automationStudioFlowDraftReplayable(input.steps)) return undefined;
    const signature = automationStudioFlowDraftFlowSignature(input.steps);
    if (signature === cleanSignature) {
      input.reusedClean?.();
      return clean ? passed(clean.verdict, clean.observations, true, signature, clean.endView) : undefined;
    }
    if (refused?.signature === signature && refused.replays >= MAX_REPLAYS_OF_ONE_DRAFT) {
      // The same Flow those replays refused, so the same verdict: its steps
      // that did not replay are marked `again`, and its issues are the same.
      // One line says nothing changed, that it was not run again, and what to
      // change. Nothing is replayed, so the target has not moved.
      const feedback = { ...automationStudioFlowDraftDryRunFeedback(refused.verdict, asked, input.steps), unchanged: unchangedLine(input.steps, refused.verdict, "not_replayed") };
      input.accountEvidence(feedback);
      input.showEvidence({ callId: `${AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID}.${attempts}.again`, toolId: AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID, value: feedback });
      return { issueCodes: automationStudioFlowDraftDryRunIssueCodes(refused.verdict) };
    }
    attempts += 1;
    const lastingIds = await lastingActs();
    let replay: Awaited<ReturnType<typeof replayAutomationStudioFlowDraft>>;
    try {
      replay = await replayAutomationStudioFlowDraft({
        steps: input.steps,
        attempt: attempts,
        executeTool: input.executeTool,
        ...(lastingIds ? { lastingActs: lastingIds } : {}),
        ...(input.nodeOf ? { nodeOf: input.nodeOf } : {}),
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
    // A written step the test never came to has shown nothing, however the
    // rest replayed: the Flow is not tested whole, so it is refused as such.
    const unreached = notReached(input.steps, replay.verdict);
    if (replay.verdict.ok) {
      if (unreached.length) return refuseUnrunnable(unreached);
      cleanSignature = signature;
      return passed(replay.verdict, replay.observations, false, signature, await lookedAt(replay.verdict));
    }
    // A step the replay found missing and proved the Flow did not need -- a
    // banner the site remembers having been answered -- is made optional rather
    // than refused, when that is all that stood in the way
    // (`../../flow-draft/sometimes-present.ts`). The pass is keyed on the Flow
    // with that routing written: this replay is a run of that Flow, every step
    // it sent unchanged, and the one it made optional is the one it found absent.
    const optional = madeOptional(input.steps, replay.verdict);
    if (optional && unreached.length) return refuseUnrunnable(unreached);
    if (optional) {
      cleanSignature = automationStudioFlowDraftFlowSignature(input.steps);
      return passed(optional, replay.observations, false, cleanSignature, await lookedAt(optional));
    }
    // A Flow the last refused test was also a test of: run again unchanged.
    const again = refused?.signature === signature;
    const previous = again ? refused?.verdict : undefined;
    refused = { signature, verdict: replay.verdict, replays: again && refused ? refused.replays + 1 : 1 };
    // The target as it was when the replay broke, which is what a correction
    // has to be made from, and then the verdict that says what to do about it.
    if (replay.evidence) {
      input.accountEvidence(replay.evidence.value);
      input.showEvidence({ callId: replay.evidence.callId, toolId: AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_PAGE_TOOL_ID, value: replay.evidence.value });
    }
    const verdictFeedback = automationStudioFlowDraftDryRunFeedback(replay.verdict, asked, input.steps);
    const feedback = again ? { ...verdictFeedback, unchanged: unchangedLine(input.steps, replay.verdict, sameFailures(previous, replay.verdict) ? "replayed" : "replayed_differently") } : verdictFeedback;
    for (const outcome of replay.verdict.outcomes) {
      if (outcome.status !== "replayed") asked.add(automationStudioFlowDraftReplayOutcomeKey(outcome));
    }
    input.accountEvidence(feedback);
    input.showEvidence({ callId: `${AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID}.${attempts}`, toolId: AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID, value: feedback });
    return { issueCodes: automationStudioFlowDraftDryRunIssueCodes(replay.verdict) };
  };
}

/**
 * The written steps of a repeat the test never ran on a row, as `not_reached`:
 *
 *   - a span whose list had no rows in the test ran them zero times (`passes`
 *     empty);
 *   - a span the test could not walk (no node lookup, a list step that did not
 *     replay clean, no rows given back) sent them once on the row the build
 *     explored, with no `passes`, and excused one that did not pass there as
 *     conditional.
 *
 * Either way nothing ran the step, since a written step never ran in the build.
 * A recorded step in the same span ran live while exploring, so it answers as
 * any conditional step does -- unless the test could not walk the span and the
 * step's call failed `core.replay.unresolved_binding`: it is bound to the row
 * (`$row`), so its bound form has never run on one, and excusing it would
 * propose a loop body nothing ever tested (t252-w7b's proof without `nodeOf`).
 * A step withheld behind a lasting act is excused for that (`withheldBy`), not
 * refused here.
 */
function notReached(steps: readonly AutomationStudioFlowDraftStep[], verdict: AutomationStudioFlowDraftDryRun): { position: number; actionId: string; word: AutomationStudioFlowDraftUnrunnableWord }[] {
  const repeated = repeatedStepIds(steps);
  return verdict.outcomes.flatMap((outcome) => {
    const zeroPasses = outcome.passes?.length === 0 && outcome.status === "replayed";
    const unwalked = outcome.passes === undefined && outcome.withheldBy === undefined && outcome.status !== "replayed";
    if (!zeroPasses && !unwalked) return [];
    const step = steps.find((candidate) => candidate.position === outcome.step);
    if (!step) return [];
    const rowNeverGiven = unwalked && outcome.resultCode === AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_UNRESOLVED_BINDING_CODE;
    if (!(step.written || rowNeverGiven) || (unwalked && !repeated.has(automationStudioFlowDraftStepId(step)))) return [];
    return [{ position: step.position, actionId: step.actionId, word: "not_reached" as const }];
  });
}

/**
 * The ids of every step inside a repeat: the conditional set
 * (`../../flow-draft/routing.ts`) of the draft with only its repeats routed, so
 * the span rule stays the one the dry run excuses by.
 */
function repeatedStepIds(steps: readonly AutomationStudioFlowDraftStep[]): ReadonlySet<string> {
  const repeatsOnly = steps.map((step): AutomationStudioFlowDraftStep => {
    if (!step.routing || step.routing.kind === "repeat") return step;
    const { routing: _otherRouting, ...unrouted } = step;
    return unrouted;
  });
  return automationStudioFlowDraftConditionalStepIds(repeatsOnly);
}

/**
 * The line a refusal of an unchanged refused Flow carries: nothing changed
 * since the last test, it was run again and failed the same way or was not run
 * again, and the steps that stood in the way -- those that did not replay and
 * that the Flow does not pass over -- are what to change, in the refusal's own
 * words.
 */
function unchangedLine(steps: readonly AutomationStudioFlowDraftStep[], verdict: AutomationStudioFlowDraftDryRun, test: "replayed" | "replayed_differently" | "not_replayed"): string {
  // The verdict's own exemption (`../../flow-draft/dry-run.ts`): a step of a
  // repeat the test ran once per row (`passes`) is excused only by a withheld effect.
  const excused = new Set([...automationStudioFlowDraftConditionalStepIds(steps), ...automationStudioFlowDraftWithheldStepIds(verdict.outcomes)]);
  const passedOver = (outcome: AutomationStudioFlowDraftDryRun["outcomes"][number]): boolean => outcome.stepId !== undefined && excused.has(outcome.stepId)
    && (outcome.passes === undefined || outcome.withheldBy !== undefined);
  const failing = verdict.outcomes
    .filter((outcome) => automationStudioFlowDraftReplayOutcomeBlocks(outcome) && !passedOver(outcome))
    .map((outcome) => `step ${outcome.step} (${outcome.status})`);
  const head = test === "replayed"
    ? "Nothing in the Flow changed since the last test, and it failed the same way again."
    : test === "replayed_differently"
      ? "Nothing in the Flow changed since the last test, and it failed again."
      : "Nothing in the Flow changed since that test, so it would fail the same way, and it was not run again.";
  if (!failing.length) return `${head} Change the Flow before you say it is ready.`;
  const one = failing.length === 1;
  const named = one ? failing[0] : `${failing.slice(0, -1).join(", ")} and ${failing[failing.length - 1]}`;
  return `${head} Change ${named} before you say the Flow is ready: rerun ${one ? "it" : "each"} with a corrected argument (amend_draft rerun), mark it optional, or drop it.`;
}

/** Whether two refused replays of one Flow failed on the same steps with the same answers. */
function sameFailures(before: AutomationStudioFlowDraftDryRun | undefined, after: AutomationStudioFlowDraftDryRun): boolean {
  const failures = (verdict: AutomationStudioFlowDraftDryRun) => JSON.stringify([verdict.reset, verdict.outcomes.filter(automationStudioFlowDraftReplayOutcomeBlocks).map((outcome) => [outcome.step, outcome.status])]);
  return before !== undefined && failures(before) === failures(after);
}

/** Why the test cannot run `step`: carried and never run, off the library, or nothing to run it again with. */
function unrunnableWord(step: AutomationStudioFlowDraftStep, offLibrary: readonly AutomationStudioFlowDraftStep[]): AutomationStudioFlowDraftUnrunnableWord {
  if (automationStudioFlowDraftStepCarried(step) && (step.ranWith === undefined || step.replay === undefined)) return "not_run_in_this_build";
  return offLibrary.includes(step) ? "not_a_library_step" : "cannot_run_again";
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
