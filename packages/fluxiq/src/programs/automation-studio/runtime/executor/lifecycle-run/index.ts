// The lifecycle dispatcher's runtime (state-aware recovery plan, C3-C5, C7,
// C9): host fact observation, the run's handler registry, running a handler
// body in a handler frame, the dispatcher, and the run's incident ledger. The
// pure contracts it builds on are `../lifecycle/`; graph-run calls it.
export {
  automationStudioLifecycleRunState,
  type AutomationStudioIncidentHandlerRun,
  type AutomationStudioLifecycleFrameView,
  type AutomationStudioLifecycleGraph,
  type AutomationStudioLifecycleRunState,
  type AutomationStudioRegisteredLifecycleGraph,
  type AutomationStudioRunIncident
} from "./run-state.ts";
// One batched host call per boundary, and what Core keeps of each answer.
export { observeAutomationStudioFacts, type AutomationStudioFactObservation, type AutomationStudioFactObservationGroup } from "./fact-observation.ts";
export { automationStudioHostFactConditionResult } from "./host-fact-result.ts";
export { automationStudioConditionEvidence } from "./condition-evidence.ts";
// The registry: active frames' graphs plus the recovery Subflow graph.
export { automationStudioActiveLifecycleRegistrations, automationStudioRegisterLifecycleGraph } from "./registry.ts";
export { automationStudioLifecycleHasHandlers } from "./has-handlers.ts";
// The dispatcher.
export type {
  AutomationStudioLifecycleDispatchInput,
  AutomationStudioLifecycleDispatchOutcome,
  AutomationStudioLifecycleHandlerRun,
  AutomationStudioLifecycleRouteGuard,
  AutomationStudioLifecycleRouteTarget
} from "./dispatch-contracts.ts";
export { dispatchAutomationStudioLifecycleEvent } from "./dispatch.ts";
export { runAutomationStudioHandlerBody, type AutomationStudioHandlerBodyRun } from "./handler-body.ts";
export { automationStudioHandlerBodyInputs } from "./body-inputs.ts";
export { automationStudioLifecycleRouteTarget } from "./route-target.ts";
export { automationStudioLifecycleRunRecords } from "./dispatch-records.ts";
// The incident ledger (C7) and what a failed attempt counted as.
export { automationStudioIncidentArrivalKey, closeAutomationStudioRecoveryIncident, openAutomationStudioRecoveryIncident } from "./incident-open.ts";
export { automationStudioAttemptFailureClass, markAutomationStudioIncidentFailure, type AutomationStudioFailureFacts } from "./incident-true-failure.ts";
// In-run model repair (C6 step 8): what the executor asks the run session, and what it gets back.
export type {
  AutomationStudioIncidentRepair,
  AutomationStudioIncidentRepairCallback,
  AutomationStudioIncidentRepairRequest,
  AutomationStudioRepairUnit,
  AutomationStudioRunRepair
} from "./incident-repair.ts";
export { automationStudioIncidentHandlerRetrial } from "./handler-retrial.ts";
// The run's completed-act ledger (C5, t411): a completed lasting act is skipped as already done, never repeated.
export type { AutomationStudioCompletedAct } from "./completed-act.ts";
export { automationStudioCompletedActIdentity } from "./act-identity.ts";
