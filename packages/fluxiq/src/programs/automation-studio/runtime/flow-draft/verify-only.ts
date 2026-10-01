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
// other step is run again exactly as before. Nothing here widens or narrows
// what a person is asked: a check is not the act, and the act stays gated
// where it always was.
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
 * repeat a lasting effect, `replay` otherwise.
 *
 * The declaration is read from what the Flow keeps (`ranWith`) before what the
 * model wrote (`input`), the same order a replay reads the step's argument in.
 * Core reads only whether it says anything but none: an unrecognised class is
 * still a claim that something lasts, and the gate -- not this -- decides
 * whether a class is one Core knows.
 */
export function automationStudioFlowDraftStepReplayMode(step: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftReplayMode {
  if (step.effect !== "mutate") return "replay";
  const declared = step.ranWith && "consequences" in step.ranWith ? step.ranWith.consequences : step.input.consequences;
  return declaresLasting(declared) ? "verify" : "replay";
}

/**
 * Whether a declaration names anything lasting.
 *
 * Absent is no declaration, and is not lasting: that is an older caller. A
 * list or a comma string is lasting when one word in it is not none. Any other
 * shape is not a statement of "nothing", so it is read as lasting: a dry run
 * that cannot tell whether a step lasts does not repeat it.
 */
function declaresLasting(declared: JsonValue | undefined): boolean {
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
