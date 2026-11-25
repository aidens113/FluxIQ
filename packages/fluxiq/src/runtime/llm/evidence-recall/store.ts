// What `core.recall_result` answers from: every result an attempt's calls got back, by round (t1036, D10).
//
// **Why it outlives a round.** A fresh round's window starts again, and its earlier rounds reach it only as a list
// of the calls they made, each named by its id (`answer-first/earlier-rounds/`). Naming one of those ids to the recall
// has to give its result back, so the results a recall answers from are the attempt's, not one loop's. A store made
// per loop binding, as before, answered every earlier round's id as not found.
//
// **Repeated ids stay distinct.** Ids are unique within one loop only: every round opens with the same opening call
// id, and a model's own call ids restart. So each result is kept under its id and the round it ran in, and a recall
// that names no round reads the current round's result first, then the latest earlier round's; it says which round
// it gave and which other rounds ran the same id, and naming `round` picks one of them.
//
// Held in memory for the attempt and dropped with it: nothing is persisted.

import type { JsonValue } from "../../../core/index.ts";

/** An attempt's remembered results, by call id and round. */
export type AutomationStudioLlmEvidenceRecallStore = {
  /** A round begins: results remembered from now on are this round's. Before the first call, round 1. */
  round(ordinal: number): void;
  /** One call's result, as the loop got it back. A second result under the same id in the same round replaces the first. */
  remember(callId: string, value: JsonValue): void;
  /** The result under `callId`: in `round` when one is named, else the current round's, else the latest earlier round's; with every round that ran the id. */
  recall(callId: string, round?: number): { value: JsonValue; round: number; rounds: number[]; current: number } | undefined;
};

/** A fresh store, in round 1. */
export function automationStudioLlmEvidenceRecallStore(): AutomationStudioLlmEvidenceRecallStore {
  const results = new Map<string, Map<number, JsonValue>>();
  let current = 1;
  return {
    round(ordinal) {
      if (Number.isInteger(ordinal) && ordinal > 0) current = ordinal;
    },
    remember(callId, value) {
      const byRound = results.get(callId) ?? new Map<number, JsonValue>();
      byRound.set(current, value);
      results.set(callId, byRound);
    },
    recall(callId, round) {
      const byRound = results.get(callId);
      if (!byRound) return undefined;
      const rounds = [...byRound.keys()].sort((a, b) => a - b);
      const chosen = round !== undefined ? (byRound.has(round) ? round : undefined) : byRound.has(current) ? current : rounds.filter((each) => each < current).at(-1) ?? rounds.at(-1);
      if (chosen === undefined) return undefined;
      return { value: byRound.get(chosen)!, round: chosen, rounds, current };
    }
  };
}
