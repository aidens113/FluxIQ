// What each attempt did, held for the whole attempt across a resume (t963): the judge of a carried-on attempt's
// result still sees every call and every saved Flow step that produced it, not only those after the person's press.
//
// **In memory only, on purpose**, as the before readings are (`../witnesses/before-readings.ts`): a trail holds page
// views, and what is persisted beside a Flow holds no page text. A Core that restarted holds none, and a carried-on
// attempt then starts its trail with Core's entry saying the calls before its resume are not held here (never one
// made up), so the judge reads the rest as the later part of the attempt.
//
// Keyed by the attempt. A carry-on keeps its attempt's id and so its trail. A person's Run again is judged on its own
// change (`../completion/check.ts`), so it starts an empty one.

import type { AutomationStudioResultTrailStep } from "../../../../../runtime/result-verification/index.ts";

/** The most attempts whose trail is held per service: the oldest goes first. */
const MOST_HELD = 32;

/** Core's entry for the calls a carried-on attempt made before its resume, where this Core holds none of them. */
const NOT_HELD: AutomationStudioResultTrailStep = {
  did: "core.earlier_calls_not_held",
  outcome: "not_held",
  found: "This attempt carried on from an earlier part whose calls this Core no longer holds, as it restarted since. What those calls produced is in the rows, the acts and the reads' accounts; the entries after this one are the calls made since the attempt carried on."
};

export type AutomationStudioAnswerFirstTrails = {
  /** The trail `attemptId` adds to: the one held for it on a carry-on, a fresh one otherwise. */
  of(attemptId: string, opening: { carriedOn: boolean; askedAgain: boolean }): AutomationStudioResultTrailStep[];
};

const HELD = new WeakMap<object, AutomationStudioAnswerFirstTrails>();

/** The service's trails, made on first ask. */
export function automationStudioAnswerFirstTrailsOf(owner: object): AutomationStudioAnswerFirstTrails {
  const known = HELD.get(owner);
  if (known) return known;
  const trails = new Map<string, AutomationStudioResultTrailStep[]>();
  const made: AutomationStudioAnswerFirstTrails = {
    of(attemptId, opening) {
      const earlier = opening.carriedOn && !opening.askedAgain ? trails.get(attemptId) : undefined;
      const trail = earlier ?? (opening.carriedOn && !opening.askedAgain ? [NOT_HELD] : []);
      trails.delete(attemptId);
      trails.set(attemptId, trail);
      for (const oldest of trails.keys()) {
        if (trails.size <= MOST_HELD) break;
        trails.delete(oldest);
      }
      return trail;
    }
  };
  HELD.set(owner, made);
  return made;
}
