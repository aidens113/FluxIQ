// Answers the three events that wait for the program: a person-only moment, the
// developer's check, and a transform written as a function (plan, N4, N6, D2).

import type { FluxNodeEventAnswer, FluxNodeRunEvent } from "@fluxiq/contracts/fluxnode";
import type { AnyFluxNode } from "../define/index.ts";
import { runCheck } from "./run-check.ts";
import type { RunOptions } from "./run-types.ts";

const MAX_TEXT = 1000;

/**
 * The answer the program gives `event`, or `undefined` when it gives none: an event
 * that does not wait, or a person-only moment with no `onPersonNeeded` (the run then
 * ends `waiting_for_person` and the program resumes it later).
 */
export async function answerFor(event: FluxNodeRunEvent, node: AnyFluxNode | undefined, options: RunOptions): Promise<FluxNodeEventAnswer | undefined> {
  if (event.type === "check_needed") return runCheck(node, event);
  if (event.type === "person_needed") {
    if (options.onPersonNeeded === undefined) return undefined;
    const given = await options.onPersonNeeded(event);
    const answer = typeof given === "string" ? { outcome: given } : given;
    return answer.note === undefined ? { type: "person_answer", eventId: event.eventId, outcome: answer.outcome } : { type: "person_answer", eventId: event.eventId, outcome: answer.outcome, note: answer.note.slice(0, MAX_TEXT) };
  }
  if (event.type === "transform_needed") {
    const transform = options.transforms?.[event.callback];
    if (transform === undefined) return { type: "transform_answer", eventId: event.eventId, error: `This program registered no transform named "${event.callback}".` };
    try {
      return { type: "transform_answer", eventId: event.eventId, records: await transform(event.records) };
    } catch (error) {
      return { type: "transform_answer", eventId: event.eventId, error: `The transform "${event.callback}" threw: ${error instanceof Error ? error.message : String(error)}`.slice(0, MAX_TEXT) };
    }
  }
  return undefined;
}
