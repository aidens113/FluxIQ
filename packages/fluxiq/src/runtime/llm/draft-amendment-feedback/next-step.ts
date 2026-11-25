// Split from the former `../draft-amendment-feedback.ts` (t694); the module's account is in `./index.ts`.

import type { AutomationStudioFlowDraftAmendmentRefusal } from "../../flow-authoring/draft/index.ts";
import { automationStudioLlmEvidenceNarrowedNothing } from "../repeat-guard/index.ts";
import type { AutomationStudioDraftAmendmentFeedbackStep } from "./step.ts";
import { rowAct } from "./row-act.ts";
import { didNotWork, refusedAgain } from "./did-not-work.ts";

/**
 * What to do instead of a refused amendment about a listing, in the draft's
 * numbers, or nothing when the refusal is not about one.
 *
 * `over_not_before`: the listing is whichever of the two steps named only
 * reads -- `over`, or the step the repeat was put on (`13 repeat over 13`).
 * `changes_nothing`: about a step that did not work, that the same call would
 * be refused again (header, C4); a read with a condition that left out no row,
 * that condition and what it read (t693); otherwise the step rerun unchanged,
 * when it only reads; when an act repeats over it, a read after it is a new step.
 */
export function nextStep(refusal: AutomationStudioFlowDraftAmendmentRefusal, steps: readonly AutomationStudioDraftAmendmentFeedbackStep[]): string | undefined {
  const at = (position: number | undefined) => position === undefined ? undefined : steps.find((step) => step.position === position);
  if (refusal.reason === "act_already_named" && refusal.act?.endsWith(".quantity") && at(refusal.step)?.routing?.kind === "repeat") {
    return `Step ${refusal.step} names ${refusal.act} but repeats over other items. If the quantity checklist says quantity_is_a_repeat, send {"step": ${refusal.step}, "change": "unrepeat"}, then set this item's quantity with its own quantity control and go on with missing acts. Do not repeat the add over a list to set a singular quantity.`;
  }
  const reads = (step: AutomationStudioDraftAmendmentFeedbackStep | undefined): step is AutomationStudioDraftAmendmentFeedbackStep => step?.effect !== undefined && step.effect !== "mutate";
  if (refusal.reason === "over_not_before") {
    const act = at(refusal.step);
    const named = at(refusal.over);
    if (act?.effect === "mutate" && act.effectApplied !== false && reads(named) && named.position > act.position) return listingFirst(act, named.position);
    const listing = [at(refusal.over), at(refusal.step)].find(reads);
    return listing ? `Step ${listing.position} is the listing, so the repeat cannot go on it. ${rowAct(listing.position, steps)}` : undefined;
  }
  if (refusal.reason === "changes_nothing") {
    const listing = at(refusal.step);
    // A step that did not work never ran: it has no result to stand (header, C4).
    if (listing && didNotWork(listing)) return refusedAgain(listing);
    if (!reads(listing)) return undefined;
    const loop = repeatOver(listing, steps);
    return automationStudioLlmEvidenceNarrowedNothing(listing) ?? (loop ? readAfterAct(listing.position, loop.position) : `Step ${listing.position}'s identical request was not sent again. Inspect the previous result: only if it actually returned the intended rows should you go on to the act; otherwise correct the failed/refused argument or gather new evidence. If those rows are right: ${rowAct(listing.position, steps)}`);
  }
  return undefined;
}

/**
 * The step after the listing whose repeat is already over it, or nothing. The
 * draft names a step in routing by its id, or `p<position>` for a step built
 * without one (`../flow-draft/routing.ts`, `automationStudioFlowDraftStepId`).
 */
export function repeatOver(listing: AutomationStudioDraftAmendmentFeedbackStep, steps: readonly AutomationStudioDraftAmendmentFeedbackStep[]): AutomationStudioDraftAmendmentFeedbackStep | undefined {
  const name = listing.id ?? `p${listing.position}`;
  return steps.find((step) => step.position > listing.position && step.routing?.kind === "repeat" && step.routing.over === name);
}

/**
 * What an unchanged rerun of a listing an act already repeats over needs
 * instead (live run `run-mux6nxst-c9bca37c`, D3-2): the loop is in place, a
 * rerun only replaces the listing, and a read of the rows after the act is a
 * new step, run where the act left the page, which puts it in the draft after
 * it. Nineteen decisions of that run reran step 6 unchanged, each told to put
 * the repeat on step 7, which already carried it.
 */
export function readAfterAct(listing: number, act: number): string {
  return `Step ${act} already repeats over step ${listing}, so the loop is in place: rerunning step ${listing} only replaces it and never adds a step after step ${act}. A read of the rows after the act is a new step: with the act done on the page, run the read there as a new call ("core.run_node"), which puts it in the draft after step ${act}, with a where keeping the rows the instruction asks for -- or write it with write true.`;
}

/**
 * What a repeat on the act at `act.position` over the listing at `listing`,
 * after it, needs instead. The Flow runs its steps in the order they ran and no
 * edit moves a step (`../../flow-authoring/draft/amendment/`), so the act is
 * done again after the listing, on one row it kept, and the repeat goes on that
 * new step; the act before the listing is then dropped.
 */
export function listingFirst(act: AutomationStudioDraftAmendmentFeedbackStep, listing: number): string {
  const at = act.position;
  return `Step ${listing} is the listing, and it ran after step ${at}, the act the repeat was put on: over must come before the act, and the Flow runs its steps in the order they ran, so the same repeat is refused however often it is sent. Do the act after the listing: on the page step ${listing} left, run the act on one row it kept -- that row's own control -- with its act, then send {"step": <that new step>, "change": "repeat", "over": ${listing}}, and drop step ${at}.`;
}
