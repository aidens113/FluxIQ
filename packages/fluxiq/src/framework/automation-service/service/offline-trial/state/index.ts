// A candidate trial answered by the state engine (Answer First, the Simulation): the run,
// its pure evidence result, and which step each gap sits on. Wired into no live path.
export { automationStudioStateTrialEvidenceResult, type AutomationStudioStateTrialReference } from "./evidence-result.ts";
export { automationStudioStateTrialStepGaps, type AutomationStudioOfflineStateTrialStepGap } from "./step-gaps.ts";
export { runAutomationStudioOfflineStateTrial } from "./run.ts";
export type { AutomationStudioOfflineStateTrialInput, AutomationStudioOfflineStateTrialOutcome, AutomationStudioOfflineStateTrialRan } from "./run.ts";
