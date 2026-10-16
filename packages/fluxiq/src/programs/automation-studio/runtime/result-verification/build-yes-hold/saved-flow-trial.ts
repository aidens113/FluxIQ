// The judged-trial port a run's result check is given (`./judged-trial.ts`),
// read off the saved Flow (t662): the record apply wrote on the parent Flow
// when it applied a build's judged-yes candidate
// (`../../flow-version/judged-build-trial/`), and only where the run executed
// exactly the graph versions apply saved.

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioFlowJudgedBuildTrialFromMetadata, automationStudioRanJudgedVersions } from "../../flow-version/index.ts";
import type { AutomationStudioResultJudgedBuildTrialPort } from "./judged-trial.ts";

/**
 * The port over the saved Flow's metadata. Nothing for a Subflow-scoped run
 * (the record is the whole Flow's trial, judged against the whole Flow's
 * request), for a run that is the trial itself, or for a run of any other
 * version. A Flow that cannot be read is not read as "no trial": the error
 * goes on to the run's result check, which records that it did not finish.
 */
export function automationStudioResultJudgedBuildTrialOfSavedFlow(ports: {
  flowMetadata(projectId: string, flowId: string): Promise<JsonObject | undefined>;
}): AutomationStudioResultJudgedBuildTrialPort {
  return async (input) => {
    if (input.subflowId) return undefined;
    const record = automationStudioFlowJudgedBuildTrialFromMetadata(await ports.flowMetadata(input.projectId, input.flowId));
    if (!record || record.trialRunId === input.runId || !automationStudioRanJudgedVersions(record.versions, input.flowVersions)) return undefined;
    return { trialRunId: record.trialRunId, verdict: record.verdict, calls: record.calls, instructionDigest: record.instructionDigest };
  };
}
