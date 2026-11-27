// The trail entries each attempt's acts landed with (`./act-evidence.ts`), held for a later attempt that carries those
// acts (t1075 D), as the before reading is (`./before-readings.ts`).
//
// **In memory only, on purpose.** A trail entry holds what the site answered, page text among it. What is persisted
// beside a Flow (the act record, the task's memory) holds none. So nothing here is written anywhere: a Core that
// restarted holds none, and a carried act is then shown to its judge by its words alone, as it was before.
//
// Keyed by the attempt that holds the evidence. An attempt hands over, at the moment a later attempt opens, what it was
// handed and what its own acts landed with (`hold` takes it as a function for that reason), so a third attempt, which
// carries the second's record and through it the first's acts, finds the first's evidence too.

import type { AutomationStudioResultTrailStep } from "../../../../../runtime/result-verification/index.ts";

/** The most attempts whose evidence is held per service: the oldest goes first. */
const MOST_HELD = 32;

/** The entries each act landed with, by the act's id. */
type Evidence = ReadonlyMap<string, readonly AutomationStudioResultTrailStep[]>;

export type AutomationStudioAnswerFirstCarriedEvidence = {
  /** How `attemptId`'s evidence is read when a later attempt asks: what it was handed, and what its own acts landed with by then. */
  hold(attemptId: string, evidence: () => Evidence): void;
  /** `attemptId`'s evidence as it stands now, or none where none is held. */
  get(attemptId: string): Evidence | undefined;
};

const HELD = new WeakMap<object, AutomationStudioAnswerFirstCarriedEvidence>();

/** The service's carried evidence, made on first ask. */
export function automationStudioAnswerFirstCarriedEvidenceOf(owner: object): AutomationStudioAnswerFirstCarriedEvidence {
  const known = HELD.get(owner);
  if (known) return known;
  const held = new Map<string, () => Evidence>();
  const made: AutomationStudioAnswerFirstCarriedEvidence = {
    hold(attemptId, evidence) {
      held.delete(attemptId);
      held.set(attemptId, evidence);
      for (const oldest of held.keys()) {
        if (held.size <= MOST_HELD) break;
        held.delete(oldest);
      }
    },
    get: (attemptId) => held.get(attemptId)?.()
  };
  HELD.set(owner, made);
  return made;
}
