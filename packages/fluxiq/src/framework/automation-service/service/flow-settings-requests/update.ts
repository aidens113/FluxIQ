// What `update-flow-settings` does with a settings patch: holds its limits to
// their bounds, merges it over the stored Flow, saves that, and reads back the
// settings detail the settings view redraws from.

import type { JsonObject } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_SIZE_SETTING, AUTOMATION_STUDIO_INTERVENTION_MODE_VERSION, automationStudioFlowSizeSettingIssue, withAutomationStudioInterventionMode } from "../../../../flows/authoring/model/index.ts";
import type { AutomationStudioService } from "../../service.ts";
import { assertFlowLlmExecutionSettings } from "./llm-execution-settings.ts";
import { withFlowSizeSettings } from "./size-settings.ts";

export async function updateFlowSettingsForRequest(service: Pick<AutomationStudioService, "getFlow" | "saveFlow" | "getFlowMetadataDetail">, projectId: string, flowId: string, payload: Record<string, any>) {
  const current = await service.getFlow(projectId, flowId);
  const patch = payload.flow as Record<string, any>;
  const metadata = patch.metadata && typeof patch.metadata === "object" ? patch.metadata : {};
  assertFlowLlmExecutionSettings(metadata as Record<string, unknown>);
  assertFlowSizeSettings(metadata as Record<string, unknown>);
  const next = {
    ...current,
    ...(typeof patch.name === "string" ? { name: patch.name } : {}),
    ...(typeof patch.description === "string" ? { description: patch.description } : {}),
    ...(patch.visibility === "private" || patch.visibility === "public" ? { visibility: patch.visibility } : {}),
    ...(patch.interface && typeof patch.interface === "object" ? { interface: patch.interface } : {}),
    ...(patch.executionDefaults && typeof patch.executionDefaults === "object" ? { executionDefaults: patch.executionDefaults } : {}),
    metadata: withStatedInterventionMode({ ...(current.metadata ?? {}), ...metadata }, metadata),
    ...(current.source?.mode === "code" && patch.source?.mode === "code"
      ? { source: { ...current.source, declaredDependencies: Array.isArray(patch.source.declaredDependencies) ? patch.source.declaredDependencies : current.source.declaredDependencies } }
      : {})
  };
  await service.saveFlow({
    projectId,
    flow: next,
    ...(typeof payload.expectedUpdatedAt === "number" ? { expectedUpdatedAt: payload.expectedUpdatedAt } : {})
  });
  return withFlowSizeSettings(await service.getFlowMetadataDetail(projectId, flowId), await service.getFlow(projectId, flowId));
}

/**
 * Refuses a Flow size setting no reader could use, naming it. Absent is fine:
 * the patch merges over the stored metadata, so it keeps what is stored.
 */
function assertFlowSizeSettings(metadata: Record<string, unknown>): void {
  const { metadataKey, field } = AUTOMATION_STUDIO_FLOW_SIZE_SETTING;
  const settings = metadata[metadataKey];
  if (settings === undefined) return;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error(`${metadataKey} must be an object holding ${field}.`);
  const issue = automationStudioFlowSizeSettingIssue((settings as Record<string, unknown>)[field]);
  if (issue) throw new Error(issue);
}

/**
 * The settings a caller meant when it named an intervention mode and nothing
 * else. `update-flow-settings` merges the patch over the stored metadata, so a
 * patch that sets `adaptationMode` alone left the training and policy settings
 * the mode governs at whatever they were -- for a new Flow, the creation
 * defaults, `normal` and `locked`. The document then said `manual_approval` and
 * "no LLM" at once. This applies the mode to those settings, the same mapping
 * the web settings view applies when a person picks one. A patch that supplies
 * its own training or policy settings is taken as written, and a patch that
 * names no valid mode changes nothing here.
 */
function withStatedInterventionMode(merged: JsonObject, patch: Record<string, unknown>): JsonObject {
  const mode = patch.adaptationMode;
  if (patch.adaptationModeVersion !== AUTOMATION_STUDIO_INTERVENTION_MODE_VERSION) return merged;
  if (mode !== "fully_adaptive" && mode !== "manual_approval" && mode !== "no_llm_intervention") return merged;
  if (patch.trainingModeSettings !== undefined || patch.adaptationPolicySettings !== undefined) return merged;
  return withAutomationStudioInterventionMode(merged, mode);
}
