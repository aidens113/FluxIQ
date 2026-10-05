// Which steps a dry run checks rather than runs again, and how a checked step
// reads beside the ones it ran.
//
// **The defect this closes.** A dry run replays every proposed step on the
// real target (`./dry-run.ts`), and its reset puts back the page, not what the
// site remembers. So a step whose effect lasts was done again on every dry
// run. Live run `run-muntufao-7b7bc04a` replayed one save-for-later press in two
// dry runs and moved both of a person's seeded cart lines to the saved list,
// one of which the instruction said to keep; `run-munpwa5r-e7aefe04` raised the
// cart count once per dry run through two add presses. The person was told
// neither time.
//
// **The rule (decision D1, 2026-09-30).** A dry run never clears site data or
// logs the person out -- its reset is a navigation and nothing more -- and it
// never repeats a lasting effect. A step that changes something and declares
// any consequence but none is *verified* instead of run: the host is asked to
// show that the step could run now (its target is there and would take the
// action) or that its effect is already in place, and to act on nothing. Every
// other step is run again exactly as before. A step that does an act the
// person's instruction asks to last is verified too, whatever it declared
// (t174-w83, `automationStudioFlowDraftStepReplayMode`). Nothing here widens or narrows
// what a person is asked: a check is not the act, and the act stays gated
// where it always was.
//
// **Lane B's run, the same rule (t193-1002m, merged 2026-10-03).** Live run
// `run-murwdp4f-35f976d2`'s Add to cart carried act a2 and declared
// `consequences: []`, so both build tests pressed it and the person's cart went
// from 2 to 3 to 4 items. Lane B's first fix checked every step naming any act,
// unless the next step found the target elsewhere (the step moved the page).
// Merged with lanes A and D it is the rule below and nothing more: the
// instruction's lasting acts, never every act, and no moved-page exception,
// because an under-declared lasting act that also moves the page -- a Submit, a
// Place order -- would be pressed again, which a build never does. A last step
// that only navigates while claiming a lasting act is therefore checked rather
// than followed (lane B's run `run-murzln6g-11debe1d`, R2-C8, open).
//
// **Why the declaration and not every change.** A press that only opens,
// filters or navigates is what the steps after it stand on: the chooser a
// store is picked from is open only because the press before it opened it.
// Verifying those instead of running them would leave every later target
// absent and prove nothing about the Flow. `run-munpwa5r-e7aefe04` is the
// evidence both ways: its four store-chooser presses declared none and
// replayed cleanly in all five dry runs, each depending on the one before; its
// two cart presses declared `modify_existing` and are exactly the two that
// changed the person's cart. A step with no declaration at all is an older
// caller's step and is run again, as it always was. (The web binding refuses a
// changing call that declares nothing, so every web step it keeps says.)
//
// **An instructed act is checked whatever the step declares** (live runs
// `run-murwcaj0-40e56557` R3 and `run-murwd8le-79e735a8` Cause 3). The step
// that confirmed a friend request, act a1, declared `consequences: []`, so
// every test pressed Confirm again on the person's real requests; an Add to
// cart did the same to a cart. The second witness is the instruction itself:
// a changing step claiming an act it asks to last is checked (`lastingActs`,
// t174-w83, below). An add, save, claim, move or submit lasts by its kind; a
// setting or an open lasts when the instruction's read quotes it, or when the
// read answered that act with a class or gave it no answer
// (`run-musp4h2f-72e8ed99`, where two split adds the read quoted as one
// sentence were pressed again until the cart held 12 items; t174-w107). Lane D
// first checked every step carrying any act; merged with t174-w83 (2026-10-03)
// it keeps this narrower set, because a choice (`a1.colour`) or an act that
// lasts nothing ("open saved items") is what the steps after it stand on and
// must run again.
//
// **A rerun of a done act is a check too** (the same run, R7). The repair round
// reran that step with Tom's Confirm, a request the instruction said to leave
// alone, and the rerun pressed it. A step the dry run would check, whose own
// run already did its effect (`automationStudioFlowDraftStepActDone`, the same
// rule and the same `lastingActs`), is rerun as this same check of the new
// argument, never as the effect again (`../llm/node-tools/rerun-check.ts`).
//
// **Three answers to a check, and what each does to the verdict.**
//
//   verified        -- the step could run now. It passes, and its effect was
//                      withheld from the steps after it.
//   present         -- the step's target is gone from the very page the step
//                      acted on, which is what an effect already in place looks
//                      like: the line was saved while exploring and its save
//                      control is gone, the store was chosen and its button now
//                      says "Your store" (t193-wH, `run-munri5gr-94d7f8a0`). It
//                      passes, and nothing was withheld. The host decides this
//                      from where the step found the page (`replay.from`, sent
//                      with the check), not from the model's word.
//   unreproducible  -- the target is gone and the page is not the one the step
//                      acted on: the steps before it no longer reach it. That
//                      blocks, exactly as a replayed step's does (`./dry-run.ts`).
//
// **What a withheld effect excuses, and what it does not.** The dry run starts
// from the build's own state, in which every lasting effect already happened
// while exploring, so a later step normally finds what it needs whether or not
// the check withheld the effect again. There are two exceptions, and a
// verified step that is either one excuses every step after it that does not
// replay:
//
//   - it moved the target: a submit that led to a confirmation page, a save
//     that opened the saved list. Withheld, it leaves the steps after it on the
//     page before the move. Core sees a move when the next proposed step found
//     the target somewhere other than where this one did (the two
//     `replay.from` values differ; Core compares them whole and reads
//     neither). Only the next step: nearly every later step of a Flow stands
//     on some other page, and comparing against any of them would let every
//     verified step excuse everything after it.
//   - it declared a class a person is asked about -- moving money, deleting,
//     sending or publishing (`../action-permissions/destructive.ts`). Such an
//     act is never performed in a dry run, and what comes after it is what the
//     act made: the shield after a submitted application and the confirmation
//     behind it, both on the form's own page (t195-w19d, C4), the receipt
//     after an order. Exploring did the act once, but whether the site still
//     shows its aftermath is not something a dry run can arrange without
//     doing it again.
//
// Either way their failure is the dry run's, not the Flow's. An excused step
// is marked `withheldBy`, so a reader sees exactly which verdicts rest on the
// withheld effect. A verified step that is neither excuses nothing: a failure
// after it is a failure.
//
// Core knows no domain's targets. It asks; the host answers in the replay's
// closed vocabulary, with two codes for a step that was checked and not run
// (`../llm/node-tools/replay.ts`), and one for a replayed step whose target
// the site's memory removed (`./site-memory.ts`).

import type { JsonValue } from "../../../../core/index.ts";
import { isAutomationStudioDestructiveActionConsequence } from "../action-permissions/index.ts";
import type { AutomationStudioFlowDraftReplayOutcome } from "./dry-run.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_REMEMBERED_CODE } from "./site-memory.ts";
import type { AutomationStudioFlowDraftStep } from "./step.ts";

/** The code a host answers a check with when the step could run now and was not run. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_VERIFIED_CODE = "core.replay.verified";

/** The code a host answers a check with when the step's effect is already in place and nothing was run. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_PRESENT_CODE = "core.replay.present";

/** Whether a replay runs a step again or only checks it. */
export type AutomationStudioFlowDraftReplayMode = "replay" | "verify";

/** The word a declaration writes for "nothing lasting", in any spelling the authoring readers accept. */
const NONE = "none";

/**
 * How the dry run treats this step: `verify` when running it again would
 * repeat a lasting effect, `replay` otherwise. `steps` is the draft the step
 * is in, from which its next proposed step is read.
 *
 * The declaration is read from what the Flow keeps (`ranWith`) before what the
 * model wrote (`input`), the same order a replay reads the step's argument in.
 * Core reads only whether it says anything but none: an unrecognised class is
 * still a claim that something lasts, and the gate -- not this -- decides
 * whether a class is one Core knows.
 *
 * **The instruction is a second witness (t174-w83).** A step's declaration is
 * the model's word, and the model can be wrong: run `run-murwd8le-79e735a8`
 * kept an Add to cart that declared `consequences: []`, and both of the
 * build's tests pressed it again on the person's cart (Cause 3). So a caller
 * that has read the person's instruction passes `lastingActs`: the ids of the
 * instruction's acts (`a1`, `a2` ...) that ask for something lasting -- an
 * add, save, claim, move or submit by its kind; any act the read quotes, or
 * answers with a class; and any act the read gave no answer for, lasting until
 * shown otherwise (t174-w107, run `run-musp8nz1-dbd3905a` Cause 5, whose read
 * named the cart and not the coupon)
 * (`../flow-bootstrap/action-permissions.ts`, `instructedLastingActs`).
 * A changing step that claims one of them is checked whatever it declared.
 * Only an act's own id counts. A choice of it (`a1.colour`, `a1.quantity`) is
 * a selection the act's own step stands on, and verifying it would leave that
 * step's target absent; the set holds only acts, so a choice never matches.
 * Without the set the rule is the declaration alone, as it always was.
 */
export function automationStudioFlowDraftStepReplayMode(step: AutomationStudioFlowDraftStep, lastingActs?: ReadonlySet<string>): AutomationStudioFlowDraftReplayMode {
  if (step.effect !== "mutate") return "replay";
  const declared = step.ranWith && "consequences" in step.ranWith ? step.ranWith.consequences : step.input.consequences;
  if (automationStudioFlowDraftDeclaresLasting(declared)) return "verify";
  return lastingActs?.size && step.acts?.some((act) => lastingActs.has(act)) ? "verify" : "replay";
}

/**
 * Whether a step has already done its lasting effect: one the dry run would
 * check rather than run again (`automationStudioFlowDraftStepReplayMode`, by
 * its declaration or the instruction's lasting acts), whose own run worked and
 * changed the page. A rerun of such a step is a check of the new argument, not
 * the effect again (see the header, R7).
 */
export function automationStudioFlowDraftStepActDone(step: AutomationStudioFlowDraftStep, lastingActs?: ReadonlySet<string>): boolean {
  // A checked candidate did nothing, but changing its claims/configuration
  // cannot erase the lasting effect already performed by its prior record.
  return step.priorExecution?.lasting === true || (step.effectApplied === true && step.proposes !== false && automationStudioFlowDraftStepReplayMode(step, lastingActs) === "verify");
}

/**
 * Whether a declaration names anything lasting.
 *
 * Absent is no declaration, and is not lasting: that is an older caller. A
 * list or a comma string is lasting when one word in it is not none. Any other
 * shape is not a statement of "nothing", so it is read as lasting: a dry run
 * that cannot tell whether a step lasts does not repeat it. The build's gate
 * reads a call's declaration the same way to decide whether the instruction's
 * read must be made before the call runs (`../flow-bootstrap/action-permissions.ts`).
 */
export function automationStudioFlowDraftDeclaresLasting(declared: JsonValue | undefined): boolean {
  if (declared === undefined) return false;
  const words = Array.isArray(declared) ? declared : typeof declared === "string" ? declared.split(",") : undefined;
  if (!words) return true;
  return words.some((word) => typeof word !== "string" || (word.trim().length > 0 && word.trim().toLowerCase() !== NONE));
}

/**
 * Whether an outcome is a step that was checked, found able to run, and not
 * run: its effect was withheld from the steps after it.
 */
export function automationStudioFlowDraftReplayOutcomeVerified(outcome: AutomationStudioFlowDraftReplayOutcome): boolean {
  return outcome.mode === "verify" && outcome.status === "replayed" && outcome.resultCode === AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_VERIFIED_CODE;
}

/**
 * The word an outcome is shown under: `verified` or `present` for a step that
 * was checked and not run, `remembered` for a replayed step whose target the
 * site's memory removed from its own page (`./site-memory.ts`), its status
 * otherwise. A host that answered a check by running the step says
 * `replayed`, which is what happened.
 */
export function automationStudioFlowDraftReplayOutcomeWord(outcome: AutomationStudioFlowDraftReplayOutcome): string {
  if (automationStudioFlowDraftReplayOutcomeVerified(outcome)) return "verified";
  if (outcome.status !== "replayed") return outcome.status;
  if (outcome.mode === "verify") return outcome.resultCode === AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_PRESENT_CODE ? "present" : outcome.status;
  return outcome.resultCode === AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_REMEMBERED_CODE ? "remembered" : outcome.status;
}

/**
 * The ids of steps whose failure to replay rests on an effect the dry run
 * withheld, which do not refuse the proposal (see the header).
 */
export function automationStudioFlowDraftWithheldStepIds(outcomes: readonly AutomationStudioFlowDraftReplayOutcome[]): ReadonlySet<string> {
  return new Set(outcomes.flatMap((outcome) => (outcome.withheldBy !== undefined && outcome.stepId !== undefined ? [outcome.stepId] : [])));
}

/**
 * Whether a step's own run moved the target: the next proposed step found it
 * somewhere other than where this one did. Both `from` values are the caller's
 * and are compared whole, never read. A step with no next step, or either
 * `from` missing, moved nothing that can be shown, so it excuses nothing.
 */
export function automationStudioFlowDraftStepMovedTarget(step: AutomationStudioFlowDraftStep, next: AutomationStudioFlowDraftStep | undefined): boolean {
  const here = step.replay?.from;
  const there = next?.replay?.from;
  if (here === undefined || there === undefined) return false;
  return JSON.stringify(here) !== JSON.stringify(there);
}

/**
 * Whether a verified step's withheld effect excuses the steps after it that do
 * not replay: it moved the target (`automationStudioFlowDraftStepMovedTarget`),
 * or it declared a class a person is asked about, which a dry run never
 * performs (see the header). Read from the declaration the Flow keeps
 * (`ranWith`) before what the model wrote, as the replay mode is; a shape that
 * is neither a list nor a comma string names no class and excuses nothing.
 */
export function automationStudioFlowDraftStepWithholdsLater(step: AutomationStudioFlowDraftStep, next: AutomationStudioFlowDraftStep | undefined): boolean {
  if (automationStudioFlowDraftStepMovedTarget(step, next)) return true;
  const declared = step.ranWith && "consequences" in step.ranWith ? step.ranWith.consequences : step.input.consequences;
  const words = Array.isArray(declared) ? declared : typeof declared === "string" ? declared.split(",") : [];
  return words.some((word) => typeof word === "string" && isAutomationStudioDestructiveActionConsequence(word.trim().toLowerCase()));
}
