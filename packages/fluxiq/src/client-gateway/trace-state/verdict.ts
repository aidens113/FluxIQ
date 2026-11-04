// The pure verdict over a walk (the study's section 5), with no judge. All three
// assertions hold with no gap: `pass`. Any gap: `inconclusive`, whatever else held,
// because the run left recorded support there. Otherwise a violated assertion: `fail`,
// on recorded support. The reference is the recording's own result, so a pass says
// the logic fits the recording, and it is only as right as that recording.

import type {
  ClientGatewayTraceStateAssertion,
  ClientGatewayTraceStateEndCheck,
  ClientGatewayTraceStateGapCode,
  ClientGatewayTraceStateRecording,
  ClientGatewayTraceStateVerdict
} from "./types.ts";

export function clientGatewayTraceStateVerdict(input: {
  recording: ClientGatewayTraceStateRecording;
  end: ClientGatewayTraceStateEndCheck;
  gaps: readonly ClientGatewayTraceStateGapCode[];
}): ClientGatewayTraceStateVerdict {
  const { recording, end, gaps } = input;
  const sameRows = sameSet(end.rows, recording.resultRows);
  const covered = end.skipped.length === 0;
  const hasGaps = gaps.length > 0;
  const outcome = (holds: boolean): ClientGatewayTraceStateAssertion["outcome"] => (hasGaps ? "unverified" : holds ? "satisfied" : "violated");
  const assertions: readonly ClientGatewayTraceStateAssertion[] = [
    { id: "recording.same_rows", outcome: outcome(sameRows) },
    { id: "recording.acts_covered", outcome: outcome(covered) },
    { id: "recording.reached_end", outcome: outcome(end.reachedEnd) }
  ];
  if (hasGaps) return { verdict: "inconclusive", assertions, reasons: [...new Set(gaps)] };
  const violated = assertions.filter((assertion) => assertion.outcome === "violated").map((assertion) => assertion.id);
  return { verdict: violated.length === 0 ? "pass" : "fail", assertions, reasons: violated };
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const rights = new Set(right);
  const lefts = new Set(left);
  return lefts.size === rights.size && [...lefts].every((row) => rights.has(row));
}
