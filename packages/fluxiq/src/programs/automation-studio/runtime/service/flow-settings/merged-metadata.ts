import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioInterventionMode, defaultAutomationStudioFlowSettingsMetadata, withAutomationStudioInterventionMode } from "../../../model/index.ts";
import { jsonObjectFromUnknown } from "../json-values.ts";

// Merging a Flow's stored settings metadata over the defaults, carrying the
// pre-versioning shape forward without changing what it meant.

export function mergedFlowSettingsMetadata(metadata: JsonObject | undefined): JsonObject {
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
    }
  };
}
