// Split from the former `../draft-amendment-feedback.ts` (t694); the module's account is in `./index.ts`.

import type { AutomationStudioDraftAmendmentFeedbackStep } from "./step.ts";

/**
 * The act a loop over the listing at `listing` needs: the first step after it
 * that changed something, with the repeat to put on it, or -- when there is
 * none -- that the act on one row comes first.
 *
 * A press the host says answered a layer in front of the page (`interruption`)
 * did nothing to a row the listing kept, so it is never named: live run
 * `run-muxky54f-fadb9d03` (0034, 0036) was told its "Close chat", over the
 * request list, might be the act, added a1 on it with the repeat, and the
 * checklist then said it only cleared the way. The draft records no more than
 * that of whether a press acted inside a row.
 *
 * **A listing read page by page is told its page loop, never a repeat over it
 * on the press that moves the list on (t690).** Lab step 0183 reran a read
 * that already repeated while the next-page press after it succeeded, and this
 * telling named that press as the row act: the model sent `14 repeat over 13`
 * (0184), which pressed Next once per row and broke the page loop. A press
 * inside the read's own repeat-while span is its page move, so the telling
 * says the loop is in place; a press after a read with no such loop is told
 * both forms Core accepts, the act's repeat over the read and the read's
 * repeat while the press succeeds.
 */
export function rowAct(listing: number, steps: readonly AutomationStudioDraftAmendmentFeedbackStep[]): string {
  const pages = pageLoop(listing, steps);
  if (pages) {
    return `Step ${listing} already reads the list page by page: steps ${pages.first} through ${pages.last} run again while step ${pages.last} succeeds, so step ${pages.last} moves the list on after each read and the loop ends when there is no next page. That is the page loop Core runs; leave it as it is, and never repeat step ${pages.last} over step ${listing}, which would press it once for each row.`;
  }
  const press = steps.find((step) => step.position > listing && step.effect === "mutate" && step.effectApplied !== false && step.interruption !== true);
  const repeat = (act: string): string => `{"step": ${act}, "change": "repeat", "over": ${listing}}`;
  if (!press) {
    return `No step after step ${listing} does anything to a row yet, so there is nothing to repeat. A loop over rows needs the act done once first: do it to one row step ${listing} kept -- press that row's own control, never one on a row it left out -- with add true and its act, then send ${repeat("<that press>")}.`;
  }
  const add = press.disposition === "kept" ? "" : `add step ${press.position} with its act, then `;
  return `Step ${press.position} is the first step after step ${listing} that changes something. If it is the act done to one row step ${listing} kept, the repeat goes on it: ${add}send ${repeat(String(press.position))}. If it moves the list on to its next page instead, it is no row's act: the page loop goes on the read, ${press.disposition === "kept" ? "" : `add step ${press.position}, then `}send {"step": ${listing}, "change": "repeat", "while": ${press.position}}.`;
}

/**
 * The repeat-while span the listing at `listing` runs in, in the draft's
 * numbers, or nothing: a step that repeats while its span's last step succeeds
 * (`../flow-draft/routing.ts`), from that step through its last. Steps are
 * named by id, or `p<position>` for one built without one.
 */
export function pageLoop(listing: number, steps: readonly AutomationStudioDraftAmendmentFeedbackStep[]): { first: number; last: number } | undefined {
  const positionOf = (name: string | undefined) => steps.find((step) => (step.id ?? `p${step.position}`) === name)?.position;
  for (const step of steps) {
    if (step.routing?.kind !== "repeat" || step.routing.while === undefined) continue;
    const last = positionOf(step.routing.through ?? step.routing.while);
    if (last !== undefined && step.position <= listing && listing < last) return { first: step.position, last };
  }
  return undefined;
}
