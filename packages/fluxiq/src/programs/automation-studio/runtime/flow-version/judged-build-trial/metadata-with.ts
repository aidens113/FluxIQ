import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_JUDGED_BUILD_TRIAL_METADATA_KEY, type AutomationStudioFlowJudgedBuildTrial } from "./contracts.ts";

/**
 * Metadata with the judged trial written on it, or with any earlier one
 * removed where there is none: an apply whose build judged no trial must not
 * leave the previous build's trial speaking for a Flow it did not judge.
 * Every other key is kept.
 */
export function automationStudioMetadataWithJudgedBuildTrial(
  metadata: JsonObject | undefined,
  trial: AutomationStudioFlowJudgedBuildTrial | undefined
): JsonObject {
  const { [AUTOMATION_STUDIO_FLOW_JUDGED_BUILD_TRIAL_METADATA_KEY]: _earlier, ...rest } = metadata ?? {};
  if (!trial) return rest;
  const written: JsonValue = {
    trialRunId: trial.trialRunId,
    verdict: trial.verdict,
    calls: trial.calls,
    ...(trial.firstAskConfirmed !== undefined ? { firstAskConfirmed: trial.firstAskConfirmed } : {}),
    instructionDigest: trial.instructionDigest,
    adaptationId: trial.adaptationId,
    versions: trial.versions.map((version) => ({ graphFlowId: version.graphFlowId, revision: version.revision, ...(version.subflowId ? { subflowId: version.subflowId } : {}) }))
  };
  return { ...rest, [AUTOMATION_STUDIO_FLOW_JUDGED_BUILD_TRIAL_METADATA_KEY]: written };
}
