// The judged-trial port a run's result check is given (`./judged-trial.ts`),
// read off the saved Flow (t662): the record apply wrote on the parent Flow
// when it applied a build's judged-yes candidate
// (`../../flow-version/judged-build-trial/`), and only where the run executed
// exactly the graph versions apply saved.
//
// **A routed playback is a run of the whole Flow (t664).** A8 frozen pair 7
// candidate towels `run-mvahlxuu-760d9e28`: the playback stored the trial's very
// rows and its two nos were not held. The service hands a run's result check
// the Subflow its router chose (`service.ts`, `route.selectedSubflow`), and a
// built Flow's router always chooses one, so every playback of a built Flow
// came here with a `subflowId` -- and this port named no trial for any run
// that did. A run of the whole Flow is told apart by what it executed: it
// names the orchestration Flow among its versions (`service.ts` records it
// first for every run of a saved Flow), at the very revision apply saved. A run
// of one part alone does not, and is still named no trial.

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioFlowJudgedBuildTrialFromMetadata, automationStudioRanJudgedVersions, type AutomationStudioFlowGraphVersion } from "../../flow-version/index.ts";
import type { AutomationStudioResultJudgedBuildTrialPort } from "./judged-trial.ts";

/**
 * The port over the saved Flow's metadata (header). No trial for a run that is
 * the trial itself or a Flow that carries no record (`no_build_trial`), nor for
 * a run that did not execute the whole Flow at exactly the versions apply
 * saved (`revision_mismatch`). A Flow that cannot be read is not read as "no
 * trial": the error goes on to the run's result check, which records that it
 * did not finish.
 */
export function automationStudioResultJudgedBuildTrialOfSavedFlow(ports: {
  flowMetadata(projectId: string, flowId: string): Promise<JsonObject | undefined>;
}): AutomationStudioResultJudgedBuildTrialPort {
  return async (input) => {
    const record = automationStudioFlowJudgedBuildTrialFromMetadata(await ports.flowMetadata(input.projectId, input.flowId));
    if (!record || record.trialRunId === input.runId) return { missing: "no_build_trial" };
    if (!ranTheWholeFlow(record.versions, input.flowVersions) || !automationStudioRanJudgedVersions(record.versions, input.flowVersions)) return { missing: "revision_mismatch" };
    return { trialRunId: record.trialRunId, verdict: record.verdict, calls: record.calls, instructionDigest: record.instructionDigest };
  };
}

/** Whether the run executed the orchestration Flow the record names (the version with no Subflow), not one part alone. */
function ranTheWholeFlow(judged: readonly AutomationStudioFlowGraphVersion[], ran: readonly AutomationStudioFlowGraphVersion[]): boolean {
  const orchestration = judged.find((version) => version.subflowId === undefined);
  return orchestration !== undefined && ran.some((version) => version.graphFlowId === orchestration.graphFlowId && version.subflowId === undefined);
}
