// Split from the former `../draft-amendment-feedback.ts` (t694); the module's account is in `./index.ts`.

import type { AutomationStudioFlowDraftAmendmentRefusal } from "../../flow-draft/index.ts";
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
 * What a repeat taken off after a decision's moves was, and why, or nothing
 * when the entry is not one (header, `run-musr9pv3-f4bf6256`): the step, the
 * step it repeated over -- and the one its span ran through when that broke
 * -- in the numbers the model wrote, with the numbers the draft now shows
 * where the moves changed them. A repeat that ran again while its last step
 * succeeded was over no step, and is told by that step (`takenOffWhile`).
 */
export function takenOff(refusal: AutomationStudioFlowDraftAmendmentRefusal): string | undefined {
  if (refusal.reason === "repeat_taken_off" && refusal.over === undefined) return takenOffWhile(refusal);
  if (refusal.reason !== "repeat_taken_off" || refusal.over === undefined || refusal.takenOff === undefined) return undefined;
  const step = refusal.step;
  const over = refusal.over;
  const span = refusal.takenOff === "span_broken" && refusal.through !== undefined ? refusal.through : undefined;
  const why = span === undefined
    ? `after this decision's moves step ${over} runs after step ${step}, and a repeat's over has to run before the step it repeats`
    : `after this decision's moves step ${span} runs before step ${step}, so the span from step ${step} through step ${span} no longer holds together`;
  const now = [
    refusal.now === undefined ? undefined : `step ${step} is now step ${refusal.now}`,
    refusal.overNow === undefined ? undefined : `step ${over} is now step ${refusal.overNow}`,
    span === undefined || refusal.throughNow === undefined ? undefined : `step ${span} is now step ${refusal.throughNow}`
  ].filter((part): part is string => part !== undefined);
  const renumbered = now.length ? ` In the draft you read next, ${now.join(", and ")}.` : "";
  return `Step ${step}'s repeat over step ${over}${span === undefined ? "" : `, through step ${span},`} was taken off: ${why}. It now runs once, in order.${renumbered} If it should still repeat, send the repeat again with the listing before the act, in the numbers the draft now shows.`;
}

/**
 * What a repeat that ran its span again while its last step succeeded was,
 * once a decision's moves broke its span (read-list design, S2): the step and
 * the last step it ran while, which now runs before it, with the numbers the
 * draft now shows where the moves changed them.
 */
export function takenOffWhile(refusal: AutomationStudioFlowDraftAmendmentRefusal): string | undefined {
  if (refusal.takenOff !== "span_broken" || refusal.through === undefined) return undefined;
  const step = refusal.step;
  const last = refusal.through;
  const now = [
    refusal.now === undefined ? undefined : `step ${step} is now step ${refusal.now}`,
    refusal.throughNow === undefined ? undefined : `step ${last} is now step ${refusal.throughNow}`
  ].filter((part): part is string => part !== undefined);
  const renumbered = now.length ? ` In the draft you read next, ${now.join(", and ")}.` : "";
  return `Step ${step}'s repeat while step ${last} succeeds was taken off: after this decision's moves step ${last} runs before step ${step}, so the span from step ${step} through step ${last} no longer holds together. It now runs once, in order.${renumbered} If it should still repeat, send the repeat again on the span's first step with while naming its last step, in the numbers the draft now shows.`;
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
 * What a step not added because a step of the Flow already does it is told, or
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
  return `Step ${refusal.step} was not added to the Flow: step ${refusal.copyOf} already does this (${what}); the Flow does each step once.`;
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
 * take, says to run it first with add true. Nothing for any other number,
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
  return `There is no step ${free} yet: a step enters the draft only by running. Run that action first as a call with add true (and its act, if it does one), and it becomes step ${free}; do not amend it before it has run.`;
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
  const lead = reach(refusal) ?? takenOff(refusal) ?? replacedAttempt(refusal) ?? secondCopy(refusal, steps) ?? notDoneThere(refusal) ?? nextStep(refusal, steps) ?? actDone(refusal, actsNotDone)
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
