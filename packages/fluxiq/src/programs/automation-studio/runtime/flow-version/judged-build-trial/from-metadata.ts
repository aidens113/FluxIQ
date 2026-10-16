import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_VERSIONS_METADATA_KEY } from "../contracts.ts";
import { automationStudioFlowVersionsFromMetadata } from "../stored-flow-versions.ts";
import { AUTOMATION_STUDIO_FLOW_JUDGED_BUILD_TRIAL_METADATA_KEY, type AutomationStudioFlowJudgedBuildTrial } from "./contracts.ts";

/**
 * The judged trial a Flow's metadata carries (`./contracts.ts`), read back
 * strictly: anything but a whole record -- a run id, a yes, a whole number of
 * calls of at least one, a digest, the adaptation and at least one version --
 * reads as none, so a damaged record holds nothing. `firstAskConfirmed` may be
 * absent (a record written before t677) but, where present, must be a flag.
 */
export function automationStudioFlowJudgedBuildTrialFromMetadata(metadata: JsonObject | undefined): AutomationStudioFlowJudgedBuildTrial | undefined {
  const stored = metadata?.[AUTOMATION_STUDIO_FLOW_JUDGED_BUILD_TRIAL_METADATA_KEY];
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return undefined;
  const { trialRunId, verdict, calls, firstAskConfirmed, instructionDigest, adaptationId, versions } = stored;
  if (!text(trialRunId) || verdict !== "yes" || !text(instructionDigest) || !text(adaptationId)) return undefined;
  if (typeof calls !== "number" || !Number.isSafeInteger(calls) || calls < 1) return undefined;
  if (firstAskConfirmed !== undefined && typeof firstAskConfirmed !== "boolean") return undefined;
  const read = automationStudioFlowVersionsFromMetadata({ [AUTOMATION_STUDIO_FLOW_VERSIONS_METADATA_KEY]: versions ?? null });
  if (!read.length) return undefined;
  return { trialRunId, verdict, calls, ...(firstAskConfirmed !== undefined ? { firstAskConfirmed } : {}), instructionDigest, adaptationId, versions: read };
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
