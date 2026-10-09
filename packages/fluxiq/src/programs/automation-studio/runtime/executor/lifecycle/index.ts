// The lifecycle dispatcher's pure contracts (state-aware recovery plan, C2-C7
// and C9): fact conditions, the Subflow contract and entry selection, handler
// registrations and their scope resolution, continuations and dispositions,
// the true-failure classifier, incidents and the run-level recovery budget.
// The handler vocabulary (events, scope kinds, dispositions, metadata keys) is
// owned by the node definitions in `nodes/control-flow/`.
export { automationStudioLifecycleBudget, type AutomationStudioLifecycleBudget, type AutomationStudioLifecycleBudgetSettings } from "./budget.ts";
export {
  AUTOMATION_STUDIO_EMPTY_LIFECYCLE_LEDGER,
  chargeAutomationStudioLifecycleBudget,
  type AutomationStudioIncidentSpend,
  type AutomationStudioLifecycleCharge,
  type AutomationStudioLifecycleChargeResult,
  type AutomationStudioLifecycleLedger
} from "./budget-ledger.ts";
export type { AutomationStudioHandlerDisposition, AutomationStudioLastingActStatus, AutomationStudioLifecycleContinuation } from "./continuation.ts";
export { decideAutomationStudioDisposition, type AutomationStudioCoreStop, type AutomationStudioDispositionDecision, type AutomationStudioRouteCheck } from "./dispositions.ts";
export { selectAutomationStudioEntry, type AutomationStudioEntryConsideration, type AutomationStudioEntrySelection } from "./entry-selection.ts";
export {
  AUTOMATION_STUDIO_FACT_CONDITION_OPS,
  type AutomationStudioFactCondition,
  type AutomationStudioFactConditionOp,
  type AutomationStudioFactConditionResult,
  type AutomationStudioFactConditionValue,
  type AutomationStudioFactTruth
} from "./fact-condition.ts";
export { automationStudioFactConditionsHold } from "./fact-conditions-hold.ts";
export { parseAutomationStudioFactConditions, type AutomationStudioParsedFactConditions } from "./fact-conditions-parse.ts";
export { AUTOMATION_STUDIO_AUTHORED_PATH_ORDER, automationStudioGraphHandlerRegistrations, type AutomationStudioRegistrationGraph } from "./graph-registrations.ts";
export { automationStudioHandlerOccurrenceKey, type AutomationStudioHandlerOccurrence, type AutomationStudioRecoveryIncident } from "./incident.ts";
export type { AutomationStudioHandlerRegistration, AutomationStudioHandlerScope, AutomationStudioHandlerSource } from "./registration.ts";
export { automationStudioNodeReplayRestriction, type AutomationStudioReplayRestriction } from "./replay-restriction.ts";
export { resolveAutomationStudioHandlerCandidates, type AutomationStudioHandlerCandidate, type AutomationStudioHandlerLevel } from "./scope-resolver.ts";
export { automationStudioSubflowContract, type AutomationStudioSubflowCheckpoint, type AutomationStudioSubflowContract, type AutomationStudioSubflowEntry } from "./subflow-contract.ts";
export { classifyAutomationStudioFailure, type AutomationStudioEarlierRung, type AutomationStudioFailureClass, type AutomationStudioOnFailPath } from "./true-failure.ts";
