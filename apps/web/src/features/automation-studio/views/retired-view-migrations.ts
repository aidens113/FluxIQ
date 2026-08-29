export const retiredAutomationStudioViewIds = [
  "config",
  "config-default",
  "proposal-generator",
  "proposal-workbench",
  "pipeline-workbench"
] as const;

export type RetiredAutomationStudioViewId = (typeof retiredAutomationStudioViewIds)[number];

const retiredReplacements = new Map<RetiredAutomationStudioViewId, string>([
  ["config", "flow-settings"],
  ["config-default", "flow-settings"],
  ["proposal-generator", "adaptations"],
  ["proposal-workbench", "adaptations"],
  ["pipeline-workbench", "adaptations"]
]);

export function isRetiredAutomationStudioViewId(value: string): value is RetiredAutomationStudioViewId {
  return retiredReplacements.has(value as RetiredAutomationStudioViewId);
}

export function retiredAutomationStudioViewReplacementValue(value: RetiredAutomationStudioViewId): string {
  return retiredReplacements.get(value)!;
}

export function automationStudioAdaptationsViewId(): "adaptations" {
  return retiredAutomationStudioViewReplacementValue("proposal-workbench") as "adaptations";
}