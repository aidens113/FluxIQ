import type { AutomationViewInstance } from "./view-types";
import {
  automationStudioViewDefinitions,
  automationStudioViewId,
  type AutomationStudioViewId
} from "./view-registry";

export type AutomationStudioViewInstanceLabels = Partial<Record<AutomationStudioViewId, string>>;

export function createAutomationStudioViewInstances(
  labels: AutomationStudioViewInstanceLabels = {}
): AutomationViewInstance[] {
  return automationStudioViewDefinitions().map((definition) => ({
    id: definition.id,
    label: labels[definition.id] ?? definition.label,
    type: definition.kind,
    icon: definition.icon,
    ...(
      definition.id === automationStudioViewId.clients
      || definition.id === automationStudioViewId.recordingTimeline
        ? { state: "live" as const }
        : {}
    )
  }));
}