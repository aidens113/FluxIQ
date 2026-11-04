// The pure verdict over a walk (the study's section 5), with no judge. All three
// assertions hold with no gap: `pass`. Any gap: `inconclusive`, whatever else held,
// because the run left recorded support there. Otherwise a violated assertion: `fail`,
// on recorded support. The reference is the recording's own result, so a pass says
// the logic fits the recording, and it is only as right as that recording.
//
// **A recording that read rows and kept none has no result to be the same as.** Two empty
// lists are equal, and that would pass any filter that also keeps nothing, so the verdict is
// `inconclusive` there: an empty result proves nothing about what a read should keep.
//
// **Nor does the recording speak for what follows rows it did not read.** A computed read that
// changed the rows, followed by an act or another read of rows, is `inconclusive`: a real
// Flow goes on from the rows it was given, and the recording went on from others.

import type {
  ClientGatewayTraceStateAssertion,
  ClientGatewayTraceStateEndCheck,
  ClientGatewayTraceStateGapCode,
  ClientGatewayTraceStateRecording,
  ClientGatewayTraceStateVerdict
} from "./types.ts";

/** Why a walk with no gap is still inconclusive: the recording read rows and kept none. */
const RECORDING_WITHOUT_RESULT = "recording.no_result_rows";
/** Why a walk with no gap is still inconclusive: it went on after computed rows the recording did not go on from. */
const AFTER_CHANGED_ROWS = "recording.after_changed_rows";

export function clientGatewayTraceStateVerdict(input: {
  recording: ClientGatewayTraceStateRecording;
  end: ClientGatewayTraceStateEndCheck;
  gaps: readonly ClientGatewayTraceStateGapCode[];
}): ClientGatewayTraceStateVerdict {
  const { recording, end, gaps } = input;
  const sameRows = sameSet(end.rows, recording.resultRows);
  const covered = end.skipped.length === 0;
  const hasGaps = gaps.length > 0;
  const noResult = recording.resultEntry === null && recording.entries.some((entry) => entry.kind === "read" && entry.reading.rows !== null);
  const outcome = (holds: boolean): ClientGatewayTraceStateAssertion["outcome"] => (hasGaps || noResult || end.afterChangedRows ? "unverified" : holds ? "satisfied" : "violated");
  const assertions: readonly ClientGatewayTraceStateAssertion[] = [
    { id: "recording.same_rows", outcome: outcome(sameRows) },
    { id: "recording.acts_covered", outcome: outcome(covered) },
    { id: "recording.reached_end", outcome: outcome(end.reachedEnd) }
  ];
  if (hasGaps) return { verdict: "inconclusive", assertions, reasons: [...new Set(gaps)] };
  if (noResult) return { verdict: "inconclusive", assertions, reasons: [RECORDING_WITHOUT_RESULT] };
  if (end.afterChangedRows) return { verdict: "inconclusive", assertions, reasons: [AFTER_CHANGED_ROWS] };
  const violated = assertions.filter((assertion) => assertion.outcome === "violated").map((assertion) => assertion.id);
  return { verdict: violated.length === 0 ? "pass" : "fail", assertions, reasons: violated };
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const rights = new Set(right);
  const lefts = new Set(left);
  return lefts.size === rights.size && [...lefts].every((row) => rights.has(row));
}
