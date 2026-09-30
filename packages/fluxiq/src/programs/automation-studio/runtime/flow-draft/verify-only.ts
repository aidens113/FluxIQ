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
// **The rule (t174 decision D1).** A dry run never repeats a lasting effect.
// A step that changes something and declares any consequence but none is
// *verified*: the host is asked to show that the step could run now -- its
// target resolves, is there, and would take the action -- or that its effect is
// already in place, and to act on nothing. Every other step is run again
// exactly as before. Nothing here widens or narrows what a person is asked:
// a verify is not the act, and the act stays gated where it always was.
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
// caller's step and is run again, as it always was.
//
// **What a verified step does to the steps after it.** They are still run, in
// order, on the page as the check left it -- which is the page before the
// effect. Two cases, told apart by the check's own answer:
//
//   - The check found the step could run (`verified`). Then the effect was
//     withheld, and a later step that needed it -- the confirmation a submit
//     leads to, the saved list a save fills -- may not replay for that reason
//     alone. Such a step does not refuse the proposal: the dry run caused the
//     failure, and no amendment could answer it. It is marked `withheldBy`, so
//     a reader sees exactly which verdicts rest on the withheld effect.
//   - The check found the target gone (`unreproducible`). The site already
//     holds the effect -- the line was saved while exploring -- so nothing was
//     withheld, and later steps are judged as they always were.
//
// Core knows no domain's targets. It asks; the host answers in the replay's
// closed vocabulary, with one more code for a step that was checked and not
// run (`../llm/node-tools/replay.ts`).

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDraftDryRun, AutomationStudioFlowDraftReplayOutcome } from "./dry-run.ts";
import type { AutomationStudioFlowDraftStep } from "./step.ts";

/** The code a host answers a verify with when the step could run and was not run. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_VERIFIED_CODE = "core.replay.verified";

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

/** Whether an outcome is a step that was checked and not run again. */
export function automationStudioFlowDraftReplayOutcomeVerified(outcome: AutomationStudioFlowDraftReplayOutcome): boolean {
  return outcome.mode === "verify" && outcome.status === "replayed" && outcome.resultCode === AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_VERIFIED_CODE;
}

/**
 * The word an outcome is shown under: `verified` for a step that was checked
 * and not run, its status otherwise. A host that answered a verify by running
 * the step says `replayed`, which is what happened.
 */
export function automationStudioFlowDraftReplayOutcomeWord(outcome: AutomationStudioFlowDraftReplayOutcome): string {
  return automationStudioFlowDraftReplayOutcomeVerified(outcome) ? "verified" : outcome.status;
}

/**
 * The ids of steps whose failure to replay rests on an effect the dry run
 * withheld, which do not refuse the proposal (see the header).
 */
export function automationStudioFlowDraftWithheldStepIds(outcomes: readonly AutomationStudioFlowDraftReplayOutcome[]): ReadonlySet<string> {
  return new Set(outcomes.flatMap((outcome) => (outcome.withheldBy !== undefined && outcome.stepId !== undefined ? [outcome.stepId] : [])));
}

const VERIFIED_INSTRUCTION = "verified: the step changes something that lasts, so it was not run again -- only checked that it could run now. "
  + "A step marked afterWithheld came after such a step and ran without its effect; it does not stand in the way of the proposal on its own.";

/**
 * The model's view of a refused dry run, with verified steps named as such.
 *
 * Applied to what `automationStudioFlowDraftDryRunFeedback` built rather than
 * folded into it, and positionally, because the two lists are the same
 * outcomes in the same order. A verdict with nothing verified and nothing
 * withheld comes back as it went in.
 */
export function automationStudioFlowDraftVerifiedFeedback(verdict: AutomationStudioFlowDraftDryRun, feedback: JsonObject): JsonObject {
  const checked = verdict.outcomes.some((outcome) => outcome.mode === "verify" || outcome.withheldBy !== undefined);
  if (!checked || !Array.isArray(feedback.steps)) return feedback;
  const steps = feedback.steps.map((entry, index) => {
    const outcome = verdict.outcomes[index];
    if (!outcome || entry === null || typeof entry !== "object" || Array.isArray(entry)) return entry;
    return {
      ...entry,
      replayed: automationStudioFlowDraftReplayOutcomeWord(outcome),
      ...(outcome.withheldBy !== undefined ? { afterWithheld: outcome.withheldBy } : {})
    };
  });
  return { ...feedback, steps, verified: VERIFIED_INSTRUCTION };
}
