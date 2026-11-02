// Compatibility exports; presentation remains in this program.
export type { AutomationStudioRunCheckpoint, AutomationStudioRunCheckpointOutcome, AutomationStudioRunControlEvent, AutomationStudioRunControlGate, AutomationStudioRunControlHolder, AutomationStudioRunControlPhase, AutomationStudioRunControlSnapshot, AutomationStudioRunControlState } from "../../../../runtime/run-control/index.ts";
export { AUTOMATION_STUDIO_RUN_CONTROL_MAX_PAUSED_MS, AutomationStudioRunController, AutomationStudioRunControlRegistry, automationStudioRunControlOf, automationStudioMarkRunAdapting } from "../../../../runtime/run-control/index.ts";
export type { AutomationStudioRunControllerInput, AutomationStudioRunControlRegistryOptions } from "../../../../runtime/run-control/index.ts";
export { AUTOMATION_STUDIO_RUN_PROGRESS_STATUSES, automationStudioRunProgress, type AutomationStudioRunProgress, type AutomationStudioRunProgressStatus } from "./progress-status.ts";
