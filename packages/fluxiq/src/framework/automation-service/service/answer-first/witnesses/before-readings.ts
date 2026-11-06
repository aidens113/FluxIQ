// The before reading each attempt took, held for a later attempt that carries its acts
// (lane B, unsure-loop D2). A later attempt's acts are carried as "Already done earlier", and its
// own before side can only be read after them, so without this its judge had no reading from
// before them and asked for one no look could ever give.
//
// **In memory only, on purpose.** A reading is a page view, and it holds page text. What is
// persisted beside a Flow (the act record, the task's memory) holds none, because it carries
// across tasks (`runtime/answer-first/act-record/item-names.ts`). So nothing here is written
// anywhere: a Core that restarted holds none, and the judge is then told the reading was the
// earlier attempt's and is not held (`./witnesses.ts`), never shown one made up.
//
// Keyed by the attempt that holds the reading. A later attempt carrying it keeps the same
// reading under its own id, so a third attempt, which carries the second's record, finds it too.

import type { JsonObject } from "../../../../../core/index.ts";

/** The most attempts whose reading is held per service: the oldest goes first. A reading is one page view. */
const MOST_HELD = 32;

export type AutomationStudioAnswerFirstBeforeReadings = {
  /** Holds the reading from before every act `attemptId`'s judge sees. */
  keep(attemptId: string, before: JsonObject): void;
  /** The reading `attemptId` holds, or none. */
  get(attemptId: string): JsonObject | undefined;
};

const HELD = new WeakMap<object, AutomationStudioAnswerFirstBeforeReadings>();

/** The service's before readings, made on first ask. */
export function automationStudioAnswerFirstBeforeReadingsOf(owner: object): AutomationStudioAnswerFirstBeforeReadings {
  const known = HELD.get(owner);
  if (known) return known;
  const readings = new Map<string, JsonObject>();
  const made: AutomationStudioAnswerFirstBeforeReadings = {
    keep(attemptId, before) {
      readings.delete(attemptId);
      readings.set(attemptId, before);
      for (const oldest of readings.keys()) {
        if (readings.size <= MOST_HELD) break;
        readings.delete(oldest);
      }
    },
    get: (attemptId) => readings.get(attemptId)
  };
  HELD.set(owner, made);
  return made;
}
