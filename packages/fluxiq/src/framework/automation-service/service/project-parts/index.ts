// Saving a Flow's parts into the project's library, once the Flow is saved.
export { saveProjectPartsOfAppliedFlow } from "./save-applied-flow.ts";
export { saveProjectPartsOfAppliedAdaptation } from "./save-applied-adaptation.ts";
export { AutomationStudioProjectParts } from "./project-parts.ts";
export { automationStudioFlowWriterKeepingPartCalls } from "./graph-calls.ts";
export { automationStudioAnswerFirstKnownParts, automationStudioProjectBuildKnownParts, type AutomationStudioAnswerFirstPartActs } from "./known-parts.ts";
export { projectPartIdOf, projectPartKeyOf } from "./part-id.ts";
export * from "./run/index.ts";
export type { AutomationStudioProjectPartsDependencies, AutomationStudioProjectPartsPorts, AutomationStudioProjectPartsRefusal } from "./library-types.ts";
export type {
  AutomationStudioAppliedFlowPart,
  AutomationStudioSaveProjectPartsInput,
  AutomationStudioSaveProjectPartsResult,
  AutomationStudioSavedProjectPart,
  AutomationStudioSkippedProjectPart
} from "./types.ts";
