// The trial evidence result (U5) of one offline trial, read from what the
// candidate trial runner answered and what the trace matcher reports
// (traces and offline trials, P4, "Result"):
//
// - origins `recorded` and `pure_computation`, never `live`: the trial's
//   observations were the trace's recorded answers, and everything the
//   candidate made of them was computed now; `liveEpisodeId` is `null`;
// - the source episode is the live episode the trace recorded;
// - every evidence gap the matcher recorded (a command it answered with a gap,
//   or a recorded event or artifact it could not read or feed) is missing
//   evidence under its own reason code, and any gap makes the verdict
//   `inconclusive`, whatever the judge said: the run left recorded support at
//   that point;
// - a run that ended with no operation matched while the trace recorded some,
//   and no command reached the matcher to be answered with a gap, is missing
//   evidence too (`missing_transition`, at no operation): its commands never
//   reached the recorded client, so nothing was tried against the trace, and
//   it is `inconclusive`, never a fail;
// - with no gap the verdict is the judge's: a yes is a pass with its task-goal
//   assertion satisfied; a no, or a run that failed on recorded support, is a
//   fail (`assertion_failure`) with the assertion violated; a judge that gave
//   no verdict (not judged, or unsure) leaves the trial `inconclusive` under
//   `judgement_unavailable`, the assertion unverified and the judge named as
//   the missing evidence -- never a fail, since nothing showed the goal missed;
// - the task-goal assertion follows the verdict: satisfied with a pass,
//   violated only with a fail, unverified whenever the result is inconclusive;
// - the scope is the full recorded path when the trial ran to its end on
//   recorded support, a segment otherwise.
//
// The result is validated by U5's own validator, and an invalid one throws: it
// is a defect here, never an answer to hand on.

import type { ClientGatewayTraceMatcherGap, ClientGatewayTraceMatcherReport } from "../../../../../client-gateway/index.ts";
import {
  validateAutomationStudioTrialEvidenceResult,
  type AutomationStudioTrialEvidenceAssertionOutcome,
  type AutomationStudioTrialEvidenceGap,
  type AutomationStudioTrialEvidenceReasonCode,
  type AutomationStudioTrialEvidenceResult,
  type AutomationStudioTrialEvidenceScope,
  type AutomationStudioTrialEvidenceVerdict
} from "../../../model/index.ts";
import type { AutomationStudioCandidateTrialOutcome } from "../candidate-trial/index.ts";

/** The task-goal assertion an offline trial checks: the build-test judge's question, asked of the new run's evidence. */
const TASK_GOAL = "build_test_judge.task_goal";

export function automationStudioOfflineTrialEvidenceResult(input: {
  trial: AutomationStudioCandidateTrialOutcome;
  matcher: ClientGatewayTraceMatcherReport;
  sourceEpisodeId: string;
  goalContractVersion: string;
}): AutomationStudioTrialEvidenceResult {
  const { trial, matcher } = input;
  const unreached = unreachedClient(matcher);
  const gaps = [...(unreached === undefined ? [] : [unreached]), ...matcher.gaps.map(gapEvidence)];
  const ranToEnd = trial.record.execution === "succeeded" && gaps.length === 0;
  const scope = ranToEnd ? "full_recorded_path" : "segment";
  const judgeGap = gaps.length === 0 ? unavailableJudgement(trial, scope) : undefined;
  const missingEvidence = judgeGap === undefined ? gaps : [judgeGap];
  const judged = trial.result.verdict;
  const verdict: AutomationStudioTrialEvidenceVerdict = missingEvidence.length > 0 ? "inconclusive" : judged === "yes" ? "pass" : "fail";
  const reasonCodes: AutomationStudioTrialEvidenceReasonCode[] = verdict === "inconclusive" ? missingEvidence.map((gap) => gap.reasonCode) : verdict === "pass" ? [] : ["assertion_failure"];
  const draft: AutomationStudioTrialEvidenceResult = {
    verdict,
    evidenceOrigins: ["recorded", "pure_computation"],
    scope,
    candidateRevision: trial.record.revision,
    candidateDigest: trial.record.digest,
    goalContractVersion: input.goalContractVersion,
    sourceEpisodeIds: [input.sourceEpisodeId],
    liveEpisodeId: null,
    supported: {
      observations: matcher.deliveredSequences.map((sequence) => `${matcher.traceId}#${sequence}`),
      operations: matcher.matchedOperations.map((operation) => `${operation.actionType}#${operation.ordinal}`)
    },
    assertionsChecked: [{ id: TASK_GOAL, outcome: ASSERTION_OUTCOME[verdict] }],
    reasonCodes,
    missingEvidence,
    provenance: "original"
  };
  const validated = validateAutomationStudioTrialEvidenceResult(draft);
  if (!validated.ok) throw new Error(`offline_trial.evidence_invalid: ${validated.issues.map((issue) => issue.code).join(", ")}`);
  return validated.result;
}

/** How the judge's question came out, read from the verdict: an inconclusive result showed neither that the goal was met nor that it was missed. */
const ASSERTION_OUTCOME: Readonly<Record<AutomationStudioTrialEvidenceVerdict, AutomationStudioTrialEvidenceAssertionOutcome>> = Object.freeze({
  pass: "satisfied",
  fail: "violated",
  inconclusive: "unverified"
});

/** The recorded client as missing evidence, when no operation matched though the trace recorded some and no command was answered with a gap. */
function unreachedClient(matcher: ClientGatewayTraceMatcherReport): AutomationStudioTrialEvidenceGap | undefined {
  if (matcher.recordedOperations === 0 || matcher.matchedOperations.length > 0) return undefined;
  if (matcher.gaps.some((gap) => gap.ordinal > 0)) return undefined;
  return {
    reasonCode: "missing_transition",
    scope: "segment",
    operation: null,
    detail: `no operation reached the recorded client: 0 of ${matcher.recordedOperations} recorded operations matched`
  };
}

/** The judge as missing evidence, when it gave no verdict on a run the trace supported throughout. */
function unavailableJudgement(trial: AutomationStudioCandidateTrialOutcome, scope: AutomationStudioTrialEvidenceScope): AutomationStudioTrialEvidenceGap | undefined {
  const verdict = trial.result.verdict;
  if (verdict !== "not_judged" && verdict !== "unsure") return undefined;
  return {
    reasonCode: "judgement_unavailable",
    scope,
    operation: null,
    detail: `${TASK_GOAL}: the judge gave no verdict on the run's evidence (${verdict})`
  };
}

/** One matcher gap as missing evidence: its reason, the operation it affects, and what differed, by path only. */
function gapEvidence(gap: ClientGatewayTraceMatcherGap): AutomationStudioTrialEvidenceGap {
  // The matcher's reason codes are U5's, spelled alike (`./tests/gap-vocabulary.test.ts` holds them to it).
  const reasonCode: AutomationStudioTrialEvidenceReasonCode = gap.reason;
  const fields = gap.fields.length > 0 ? `; differs at ${gap.fields.join(", ")}` : "";
  const recorded = recordedAt(gap);
  return {
    reasonCode,
    scope: "segment",
    operation: gap.actionType === "" ? null : `${gap.actionType}#${gap.ordinal}`,
    detail: `${gap.cause}${fields}${recorded}`
  };
}

/** Where in the trace the gap sits: the event that could not be read or fed, or the operation the command was compared with. */
function recordedAt(gap: ClientGatewayTraceMatcherGap): string {
  if (gap.recordedSequence === null) return "";
  if (gap.cause === "failed_delivery") return `; the recorded event at sequence ${gap.recordedSequence} could not be read or fed`;
  return `; compared with recorded sequence ${gap.recordedSequence}`;
}
