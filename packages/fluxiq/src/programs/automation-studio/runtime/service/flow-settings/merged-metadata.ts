import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_SIZE_SETTING, automationStudioFlowMaxNodesPerSubflow, automationStudioInterventionMode, defaultAutomationStudioFlowSettingsMetadata, withAutomationStudioInterventionMode } from "../../../model/index.ts";
import { jsonObjectFromUnknown } from "../json-values.ts";
import { withoutAutomationStudioLockedDefaultSettings } from "./locked-default-migration.ts";

// Merging a Flow's stored settings metadata over the defaults, carrying the
// pre-versioning shape forward without changing what it meant.

// A Flow created before 2026-09-28 carries the locked block a defect wrote into
// every new Flow, so it is cleared before anything is read off it. Applied here
// as well as at the read in `service/flows/store.ts` because this is where a
// setting becomes a decision, and a path that reached settings with metadata
// straight out of storage would otherwise still be gated. Clearing is
// idempotent, so doing it twice costs a comparison.
export function mergedFlowSettingsMetadata(stored: JsonObject | undefined): JsonObject {
  const metadata = withoutAutomationStudioLockedDefaultSettings(stored);
  const defaults = defaultAutomationStudioFlowSettingsMetadata();
  const canonical = withAutomationStudioInterventionMode(metadata, automationStudioInterventionMode(metadata));
  const configuredTrainingMode = jsonObjectFromUnknown(metadata?.trainingModeSettings)?.mode ?? metadata?.trainingMode;
  const legacy = metadata?.adaptationModeVersion !== 1 || configuredTrainingMode === "train_for_runs" || configuredTrainingMode === "train_until_stable";
  const source = legacy ? {
    ...canonical,
    ...(metadata ?? {}),
    adaptationModeVersion: 1,
    adaptationMode: automationStudioInterventionMode(metadata),
    trainingModeSettings: {
      ...(jsonObjectFromUnknown(canonical.trainingModeSettings) ?? {}),
      ...(jsonObjectFromUnknown(metadata?.trainingModeSettings) ?? {})
    },
    adaptationPolicySettings: {
      ...(jsonObjectFromUnknown(canonical.adaptationPolicySettings) ?? {}),
      ...(jsonObjectFromUnknown(metadata?.adaptationPolicySettings) ?? {})
    }
  } : canonical;
  return {
    ...defaults,
    ...source,
    trainingModeSettings: {
      ...(jsonObjectFromUnknown(defaults.trainingModeSettings) ?? {}),
      ...(jsonObjectFromUnknown(source.trainingModeSettings) ?? {}),
      recoveryBudget: {
        ...(jsonObjectFromUnknown(jsonObjectFromUnknown(defaults.trainingModeSettings)?.recoveryBudget) ?? {}),
        ...(jsonObjectFromUnknown(jsonObjectFromUnknown(source.trainingModeSettings)?.recoveryBudget) ?? {})
      }
    },
    adaptationPolicySettings: {
      ...(jsonObjectFromUnknown(defaults.adaptationPolicySettings) ?? {}),
      ...(jsonObjectFromUnknown(source.adaptationPolicySettings) ?? {})
    },
    // The Flow size setting, read the way every size bound reads it: a Flow
    // saved before it existed, or holding a value no save would have taken,
    // reads the default rather than an absent or unusable number.
    [AUTOMATION_STUDIO_FLOW_SIZE_SETTING.metadataKey]: {
      ...(jsonObjectFromUnknown(source[AUTOMATION_STUDIO_FLOW_SIZE_SETTING.metadataKey]) ?? {}),
      [AUTOMATION_STUDIO_FLOW_SIZE_SETTING.field]: automationStudioFlowMaxNodesPerSubflow(source)
    }
  };
}
