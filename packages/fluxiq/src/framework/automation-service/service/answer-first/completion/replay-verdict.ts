// How a replay of the saved Flow was checked (task speed S9, t897), as the attempt's record keeps it:
// it stood on its own record with no judge call, or a named deviation from the accepted run sent it to
// the judge. Until t897 the deviation lived only in the completion's memory, so no run could say why a
// replay was judged (dining's attempts 3 and 4, `run-mwb81x8q-432e8389`); a run's every step is kept
// as files, and this is one. Written on the attempt's row (`../attempt/keep.ts`, `../attempt/ending.ts`),
// read back on its outcome (`../attempt-store/outcome-of-record.ts`), and put in the run's step files
// as a note when the completion decides (`./check.ts`).
//
// Absent where the attempt's completion closed no replay: an exploration, a repair, a carried-on
// attempt, or a run that never reached a completion. The shape and its closed words are the contract's
// (`AutomationStudioTaskOutcomeReplay`); the row reads it back in `../attempt-store/replay-verdict.ts`.

import type { AutomationStudioTaskOutcomeReplay } from "../../../../../api-contracts/automation.ts";
import type { AutomationStudioAnswerFirstReplayDeviation } from "./replay-stands.ts";

type AutomationStudioAnswerFirstReplayVerdict = AutomationStudioTaskOutcomeReplay;

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

/** The step files' note for a verdict: a closed sentence and the closed word, nothing of the page. */
export function automationStudioAnswerFirstReplayVerdictNote(verdict: AutomationStudioAnswerFirstReplayVerdict): string {
  return verdict.stood
    ? "The saved Flow's replay stood on its record: every step ran as the accepted run did, so no judge was asked."
    : `The saved Flow's replay was judged, because it deviated from the accepted run: ${verdict.deviation}.`;
}
