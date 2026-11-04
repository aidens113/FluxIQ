// The trial evidence result (U5) of one state trial, pure and with no judge (Answer First,
// the Simulation): the three assertions the state rule's verdict checks, read as U5 reads a
// result, and the existing honesty rules unchanged.
//
// - no gap, all three assertions satisfied, the run finished: `pass`, scope
//   `full_recorded_path`. It says the Flow fits the recording and nothing more;
// - no gap, an assertion violated, or a run that stopped: `fail` under `assertion_failure`,
//   which is repair feedback on recorded support;
// - any gap: `inconclusive`, each gap missing evidence under its own reason, scope `segment`;
// - a run that never ran, or whose commands never reached the recording: `inconclusive`
//   (`missing_transition`, at no operation), as for any offline trial. Nothing was tried
//   against the recording, so what stopped it is not a failure the recording shows.
//
// **A recording is only as right as its own result.** A pass says the Flow fits the
// recording, so it says nothing of a recording nobody said yes to: a Flow can repeat a failed
// run exactly. With `reference: "unjudged"` the result is `inconclusive`
// (`judgement_unavailable`) whatever the assertions said, and a fail is not shown either,
// since differing from a run that failed may be the repair. A judged yes can still be wrong:
// that is a wrong reference, and only a live run can show it.
//
// Origins `recorded` and `pure_computation`, never `live`, and `liveEpisodeId` is `null`: a
// simulated pass can never count as live proof (`isAutomationStudioTrialEvidenceLiveSuccess`
// needs `full_live_run`, only `live`, and a live episode). The validator is U5's own, and an
// invalid result throws: it is a defect here, never an answer to hand on.

import type { ClientGatewayTraceStateEngineGap, ClientGatewayTraceStateEngineReport } from "../../../../../client-gateway/index.ts";
import { validateAutomationStudioTrialEvidenceResult, type AutomationStudioTrialEvidenceGap, type AutomationStudioTrialEvidenceResult, type AutomationStudioTrialEvidenceVerdict } from "../../../../../flows/authoring/model/index.ts";
import type { AutomationStudioOfflineTrialRunOutcome } from "../contracts.ts";

/** Whether a recording's own result had a live yes: what a pass against it is worth. */
export type AutomationStudioStateTrialReference = "judged_yes" | "unjudged";

const UNJUDGED_REFERENCE: AutomationStudioTrialEvidenceGap = Object.freeze({
  reasonCode: "judgement_unavailable",
  scope: "segment",
  operation: null,
  detail: "recording.reference: the recording's own result had no live yes, so fitting it shows nothing"
});

/** A walk with no gap that the rule still would not judge: the recording holds no result, or the run went on from rows it did not read. */
function recordingSaysNothing(reasons: readonly string[]): AutomationStudioTrialEvidenceGap {
  return { reasonCode: "judgement_unavailable", scope: "segment", operation: null, detail: `the rule would not judge this run: ${reasons.join(", ")}` };
}

/** The run stopped before its end with no gap, so what the rule's assertions read is not the whole run's. */
const RUN_FINISHED = "recording.run_finished";

export function automationStudioStateTrialEvidenceResult(input: {
  trial: Pick<AutomationStudioOfflineTrialRunOutcome, "record">;
  engine: ClientGatewayTraceStateEngineReport;
  sourceEpisodeId: string;
  goalContractVersion: string;
  /** Whether the recording's own result had a live yes. */
  reference: AutomationStudioStateTrialReference;
}): AutomationStudioTrialEvidenceResult {
  const { trial, engine } = input;
  const unreached = trial.record.execution === "not_run" || (engine.recordedOperations > 0 && engine.matchedOperations.length === 0);
  const ran = unreached && engine.gaps.length === 0 ? [unreachedClient(trial.record.execution, engine.recordedOperations)] : engine.gaps.map(gapEvidence);
  const missingEvidence = ran.length > 0 ? ran : input.reference === "unjudged" ? [UNJUDGED_REFERENCE] : engine.verdict.verdict === "inconclusive" ? [recordingSaysNothing(engine.verdict.reasons)] : [];
  const finished = trial.record.execution === "succeeded";
  const verdict: AutomationStudioTrialEvidenceVerdict = missingEvidence.length > 0 ? "inconclusive" : engine.verdict.verdict === "pass" && finished ? "pass" : "fail";
  const draft: AutomationStudioTrialEvidenceResult = {
    verdict,
    evidenceOrigins: ["recorded", "pure_computation"],
    scope: verdict === "pass" || (verdict === "fail" && finished) ? "full_recorded_path" : "segment",
    candidateRevision: trial.record.revision,
    candidateDigest: trial.record.digest,
    goalContractVersion: input.goalContractVersion,
    sourceEpisodeIds: [input.sourceEpisodeId],
    liveEpisodeId: null,
    supported: {
      observations: engine.deliveredSequences.map((sequence) => `${engine.traceId}#${sequence}`),
      operations: engine.matchedOperations.map((operation) => `${operation.actionType}#${operation.ordinal}`)
    },
    assertionsChecked: [
      ...engine.verdict.assertions.map((assertion) => ({ id: assertion.id, outcome: missingEvidence.length > 0 ? "unverified" as const : assertion.outcome })),
      { id: RUN_FINISHED, outcome: missingEvidence.length > 0 ? "unverified" : finished ? "satisfied" : "violated" }
    ],
    reasonCodes: verdict === "inconclusive" ? missingEvidence.map((gap) => gap.reasonCode) : verdict === "pass" ? [] : ["assertion_failure"],
    missingEvidence,
    provenance: "original"
  };
  const validated = validateAutomationStudioTrialEvidenceResult(draft);
  if (!validated.ok) throw new Error(`offline_trial.evidence_invalid: ${validated.issues.map((issue) => issue.code).join(", ")}`);
  return validated.result;
}

/** The recorded client as missing evidence: nothing was tried against the recording. */
function unreachedClient(execution: string, recorded: number): AutomationStudioTrialEvidenceGap {
  return { reasonCode: "missing_transition", scope: "segment", operation: null, detail: `no operation reached the recorded client: 0 of ${recorded} recorded operations were answered, execution ${execution}` };
}

/** One gap as missing evidence: its reason, the operation it affects, and what differed, by path only. */
function gapEvidence(gap: ClientGatewayTraceStateEngineGap): AutomationStudioTrialEvidenceGap {
  const fields = gap.fields.length > 0 ? `; differs at ${gap.fields.join(", ")}` : "";
  const recorded = gap.recordedSequence === null ? "" : `; refused recorded sequence ${gap.recordedSequence}`;
  return {
    reasonCode: gap.reason,
    scope: "segment",
    operation: gap.actionType === "" ? null : `${gap.actionType}#${gap.ordinal}`,
    detail: `${gap.cause}${fields}${recorded}`
  };
}
