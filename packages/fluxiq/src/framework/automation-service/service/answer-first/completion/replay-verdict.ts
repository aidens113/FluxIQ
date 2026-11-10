// How a replay of the saved Flow was checked (task speed S9, t897), as the attempt's record keeps it:
// it stood on its own record with no judge call, or a named deviation from the accepted run sent it to
// the judge. Until t897 the deviation lived only in the completion's memory, so no run could say why a
// replay was judged (dining's attempts 3 and 4, `run-mwb81x8q-432e8389`); a run's every step is kept
// as files, and this is one. Written on the attempt's row (`../attempt/keep.ts`, `../attempt/ending.ts`),
// read back on its outcome (`../attempt-store/outcome-of-record.ts`), and put in the run's step files
// as a note when the completion decides (`./check.ts`).
//
// Absent where the attempt's completion closed no replay: an exploration, a repair, a carried-on
// attempt, or a run that never reached a completion.

import { AUTOMATION_STUDIO_ANSWER_FIRST_REPLAY_DEVIATIONS, type AutomationStudioAnswerFirstReplayDeviation } from "./replay-stands.ts";

export type AutomationStudioAnswerFirstReplayVerdict = { stood: true } | { stood: false; deviation: AutomationStudioAnswerFirstReplayDeviation };

/** The verdict a completion's state holds, or none where it closed no replay. */
export function automationStudioAnswerFirstReplayVerdictOf(state: { onRecord?: true | undefined; deviation?: AutomationStudioAnswerFirstReplayDeviation | undefined }): AutomationStudioAnswerFirstReplayVerdict | undefined {
  if (state.onRecord === true) return { stood: true };
  return state.deviation === undefined ? undefined : { stood: false, deviation: state.deviation };
}

/** The row's field for it: `{ replay }`, or nothing where no replay was closed. What `../attempt/keep.ts` and `../attempt/ending.ts` spread into the row. */
export function automationStudioAnswerFirstReplayKept(state: Parameters<typeof automationStudioAnswerFirstReplayVerdictOf>[0]): { replay?: AutomationStudioAnswerFirstReplayVerdict } {
  const replay = automationStudioAnswerFirstReplayVerdictOf(state);
  return replay ? { replay } : {};
}

/** A kept verdict read strictly, as a stored row is: anything else is no verdict this reads. */
export function automationStudioAnswerFirstReplayVerdictRead(value: unknown): AutomationStudioAnswerFirstReplayVerdict | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const held = value as { stood?: unknown; deviation?: unknown };
  const keys = Object.keys(held);
  if (held.stood === true && keys.length === 1) return { stood: true };
  const known: readonly string[] = AUTOMATION_STUDIO_ANSWER_FIRST_REPLAY_DEVIATIONS;
  if (held.stood === false && keys.length === 2 && typeof held.deviation === "string" && known.includes(held.deviation)) return { stood: false, deviation: held.deviation as AutomationStudioAnswerFirstReplayDeviation };
  return undefined;
}

/** The step files' note for a verdict: a closed sentence and the closed word, nothing of the page. */
export function automationStudioAnswerFirstReplayVerdictNote(verdict: AutomationStudioAnswerFirstReplayVerdict): string {
  return verdict.stood
    ? "The saved Flow's replay stood on its record: every step ran as the accepted run did, so no judge was asked."
    : `The saved Flow's replay was judged, because it deviated from the accepted run: ${verdict.deviation}.`;
}
