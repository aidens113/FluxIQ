// Split from the former `../draft-amendment-feedback.ts` (t694); the module's account is in `./index.ts`.

import type { AutomationStudioFlowDraftAmendmentRefusal } from "../../flow-authoring/draft/index.ts";
import type { AutomationStudioDraftAmendmentFeedbackStep } from "./step.ts";
import { nextStep } from "./next-step.ts";
import { fallback } from "./fallback.ts";
import { checklistLeft } from "./notes.ts";
import { lastPosition } from "./positions.ts";

/**
 * What to do about a drop refused because it would strand a step of the Flow
 * from its page, or nothing when the refusal is not one (header, D2-1).
 */
export function reach(refusal: AutomationStudioFlowDraftAmendmentRefusal): string | undefined {
  if (refusal.reason !== "strands_a_step" || refusal.strands === undefined) return undefined;
  const kept = refusal.strands;
  return `Step ${refusal.step} stays in the Flow: it is the only step of the Flow that brings the page to where step ${kept} acted, and step ${kept} is still in the Flow. Leave step ${refusal.step} in, or drop step ${kept} too if the Flow does not need it.`;
}

/**
 * What to do instead of amending or rerunning the attempt a rerun replaced, or
 * nothing when the refusal is not about one (header, `run-musp474o-e0ed7432`).
 * Like every refusal's, it ends with what the checklist still shows not done
 * when there is one (`wayOut`).
 */
export function replacedAttempt(refusal: AutomationStudioFlowDraftAmendmentRefusal): string | undefined {
  if (refusal.replacedBy === undefined) return undefined;
  const by = refusal.replacedBy;
  return `Step ${refusal.step} is the attempt step ${by}'s rerun replaced: it is listed only as the record of what was replaced, and nothing changes it, so change step ${by} instead -- amend it, or rerun it with what still differs. When step ${by} already holds the argument you meant, its result stands as shown: go on from it.`;
}

/**
 * What a step not put back because a step of the Flow already does it is told, or
 * nothing when the refusal is not one (`../flow-draft/second-copy.ts`, live run
 * `run-murwdp4f-35f976d2`, C9): the step that does it, and which kind of copy
 * it was, read off that step's effect where the draft says it.
 */
export function secondCopy(refusal: AutomationStudioFlowDraftAmendmentRefusal, steps: readonly AutomationStudioDraftAmendmentFeedbackStep[]): string | undefined {
  if (refusal.reason !== "second_copy" || refusal.copyOf === undefined) return undefined;
  const effect = steps.find((step) => step.position === refusal.copyOf)?.effect;
  const what = effect === "mutate" ? "the same press on the same page"
    : effect === undefined ? "the same press on the same page, or a read of the same list with nothing changed in between"
      : "a read of the same list with nothing changed in between";
  return `Step ${refusal.step} was not put back in the Flow: step ${refusal.copyOf} already does this (${what}); the Flow does each step once.`;
}

/**
 * What an act claimed on a step that did something else is told, from the act
 * judge's own sentence -- what the step did, and where to name the act -- or
 * nothing when the refusal is not one or carries no sentence, which
 * `fallback` answers by number (week report W1, `run-mux74k5q-1c3c2127`).
 */
export function notDoneThere(refusal: AutomationStudioFlowDraftAmendmentRefusal): string | undefined {
  if (refusal.reason !== "act_not_done_there" || refusal.said === undefined) return undefined;
  const act = refusal.act ?? "the act";
  return `${refusal.said.trim()} So ${act} was not recorded on step ${refusal.step}: do not name it there again.`;
}

/**
 * What to do instead of naming again an act the checklist already shows done,
 * or nothing when the act is still to do or there is no checklist to read.
 *
 * Live run `run-muqiojz4-04a7a8fc` sent `10 keep act a2.quantity` five
 * decisions running, each refused `act_already_named`, while the checklist
 * showed `a2.quantity` done and `a3` still to do: the reason told it only what
 * to do about an act *not* done, and the round ended. So the refusal says the
 * act needs nothing more, and names, from the checklist, what does.
 */
export function actDone(refusal: AutomationStudioFlowDraftAmendmentRefusal, actsNotDone: readonly string[] | undefined): string | undefined {
  if (refusal.reason !== "act_already_named" || refusal.act === undefined || actsNotDone === undefined) return undefined;
  if (actsNotDone.includes(refusal.act)) return undefined;
  return `Step ${refusal.step} already names ${refusal.act}, and the acts checklist shows ${refusal.act} done, so nothing is left to do for it: do not name it again.`;
}

/**
 * What to do instead of amending a step that has not run yet: a refusal of the
 * number right after the draft's last step, which is the number the step would
 * take, says to run it first. Nothing for any other number,
 * which `fallback` answers.
 *
 * Run `run-musp8nz1-dbd3905a` (t174-w108, Cause 6) had steps 1-13 and sent
 * `{step 14, add, act a1}` for an Add to cart press it had not run. It was told
 * `no_such_step` and the positions, but not that a step enters the draft by
 * running; it ran the press only in the decision after.
 */
export function notRunYet(refusal: AutomationStudioFlowDraftAmendmentRefusal, steps: readonly AutomationStudioDraftAmendmentFeedbackStep[]): string | undefined {
  if (refusal.reason !== "no_such_step") return undefined;
  const free = lastPosition(steps) + 1;
  if (refusal.step !== free) return undefined;
  return `There is no step ${free} yet: a step enters the draft only by running. Run that action first as a call (with its act, if it does one): running it puts it in the draft as step ${free}; do not amend it before it has run.`;
}

/**
 * What a refusal is told to do instead (header, W2): the most precise answer
 * the refusal and the draft allow, or the reason's own way out by number
 * (`fallback`), ending with the acts the checklist still shows not done -- the
 * one source `act_already_named` reads -- when there is one. Not for an act
 * named again that is still to do: its todo is the fault, and naming the
 * checklist would send it back to the same act.
 *
 * Live run `run-musp4h2f-72e8ed99` re-sent `keep 9` and `drop 10` three
 * decisions running, refused `already_in_flow` and `already_out` with no word
 * of the four acts still to do, and bound a press's `target` four times.
 */
export function wayOut(refusal: AutomationStudioFlowDraftAmendmentRefusal, steps: readonly AutomationStudioDraftAmendmentFeedbackStep[], actsNotDone: readonly string[] | undefined): string {
  const lead = reach(refusal) ?? replacedAttempt(refusal) ?? secondCopy(refusal, steps) ?? notDoneThere(refusal) ?? nextStep(refusal, steps) ?? actDone(refusal, actsNotDone)
    ?? notRunYet(refusal, steps) ?? pressBound(refusal, actsNotDone !== undefined) ?? fallback(refusal, steps, actsNotDone);
  if (actsNotDone === undefined) return lead;
  if (refusal.reason === "act_already_named" && refusal.act !== undefined && actsNotDone.includes(refusal.act)) return lead;
  return `${lead} ${checklistLeft(actsNotDone)}`;
}

/**
 * A bind of the control a step acted on (`control`), told as a press, or
 * nothing for any other refusal (live run `run-musp4h2f-72e8ed99`).
 */
export function pressBound(refusal: AutomationStudioFlowDraftAmendmentRefusal, checklist: boolean): string | undefined {
  if (refusal.reason !== "bind_new_key" || refusal.control !== true) return undefined;
  const press = `On step ${refusal.step}, ${refusal.parameter ?? "that parameter"} names the control the step acted on, not a value it typed: a press has no value to vary, and its control is found by its words each run, so it is never bound. Bind only a value a step typed, or a read's condition.`;
  return checklist ? `${press} Leave step ${refusal.step} as it is.` : `${press} Leave step ${refusal.step} as it is and go on with what the Flow still lacks.`;
}
