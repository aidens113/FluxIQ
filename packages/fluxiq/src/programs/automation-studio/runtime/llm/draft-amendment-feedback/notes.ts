// Split from the former `../draft-amendment-feedback.ts` (t694); the module's account is in `./index.ts`.

import type { AutomationStudioFlowDraftUnreachedStep } from "../../flow-draft/index.ts";

/**
 * What the model is told of a step the decision newly left after one that does
 * not bring it to its page (header, D2-1): the step before it now, and the
 * steps that moved the page there while exploring, or that none did.
 */
export function unreachedNote(entry: AutomationStudioFlowDraftUnreachedStep): string {
  const step = entry.step;
  const by = entry.reachedBy;
  const way = by.length === 0
    ? `No step in the draft moved the page to where step ${step} acted: run the step that gets there with add true, before step ${step}.`
    : `Step${by.length > 1 ? "s" : ""} ${by.join(", ")} moved the page to where step ${step} acted while exploring: keep ${by.length > 1 ? "the one it needs" : `step ${by[0]}`} in the Flow and put step ${step} after it with reorder.`;
  return `Step ${step} is in the Flow, but the step before it now, step ${entry.after}, does not leave the page where step ${step} acted, so when the Flow runs step ${step} runs on another page. ${way}`;
}

/** The acts the checklist still shows not done, to go on with, or that none are. */
export function checklistLeft(actsNotDone: readonly string[]): string {
  return actsNotDone.length
    ? `Still not done on the checklist: ${actsNotDone.join(", ")}. Go on with those.`
    : "Nothing on the checklist is still to do: complete when the Flow does what the person asked.";
}

/**
 * What the model is told of an act moved off a step that stays in the Flow
 * with no act: which step it left, that the step now does no act, and that it
 * is pressed in every run unless dropped -- with the drop to send, never sent
 * for it (live run `run-musp4h2f-72e8ed99`, the 3-Pack's Add to cart).
 */
export function movedNote(move: { act: string; from: number; to: number }): string {
  return `Step ${move.from} no longer does ${move.act}: step ${move.to} does it now. Step ${move.from} now does no act, yet it is still in the Flow, so it is pressed in every run unless you drop it: send {"step": ${move.from}, "change": "drop"} unless the Flow needs it for something else.`;
}
