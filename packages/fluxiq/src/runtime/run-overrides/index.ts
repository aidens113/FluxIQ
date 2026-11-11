// Barrel for a run's overrides frame (W3, t899): its type, how a run sets it, and how Core reads it.
export type { AutomationStudioRunOverrides, AutomationStudioRunTextOverride } from "./frame.ts";
export { runWithAutomationStudioRunOverrides } from "./run-with.ts";
export { automationStudioRunOverrides } from "./read.ts";
export { automationStudioOverriddenText } from "./overridden-text.ts";
export { automationStudioJudgeCriteriaText } from "./judge-criteria-text.ts";
