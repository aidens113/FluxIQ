import type { AutomationViewInstance } from "./view-types";
import {
  automationStudioViewDefinitions,
  automationStudioViewBaseId,
  automationStudioViewId,
  type AutomationStudioViewId
} from "./view-registry";

export type AutomationStudioViewInstanceLabels = Partial<Record<AutomationStudioViewId, string>>;

export function createAutomationStudioViewInstances(
  labels: AutomationStudioViewInstanceLabels & Record<string, string> = {},
  instanceIds: readonly string[] = []
): AutomationViewInstance[] {
  const canonicalIds = automationStudioViewDefinitions().map((definition) => definition.id);
  return [...new Set([...canonicalIds, ...instanceIds])].flatMap((instanceId) => {
    const baseId = automationStudioViewBaseId(instanceId);
    const definition = automationStudioViewDefinitions().find((candidate) => candidate.id === baseId);
    if (!definition) return [];
    return [{
      id: instanceId,
      label: labels[instanceId] ?? labels[definition.id] ?? definition.label,
      type: definition.kind,
      icon: definition.icon,
      ...(
        definition.id === automationStudioViewId.clients
        || definition.id === automationStudioViewId.recordingTimeline
          ? { state: "live" as const }
          : {}
      )
    }];
  });
}
