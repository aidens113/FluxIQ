// The lifecycle handler vocabulary (state-aware recovery plan, C3-C5): the Flow
// validator and the lifecycle dispatcher read the same words from here.
export {
  AUTOMATION_STUDIO_HANDLER_DEFINITION_ID,
  AUTOMATION_STUDIO_HANDLER_SCOPE_KINDS,
  AUTOMATION_STUDIO_LIFECYCLE_EVENTS,
  type AutomationStudioHandlerScopeKind,
  type AutomationStudioLifecycleEvent
} from "./handler.ts";
export {
  AUTOMATION_STUDIO_HANDLER_DISPOSITIONS,
  AUTOMATION_STUDIO_HANDLER_END_DEFINITION_ID,
  AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS,
  automationStudioDispositionAllowedAt,
  type AutomationStudioHandlerDispositionKind
} from "./handler-end.ts";

// Call Subflow runs a sibling Subflow graph as a frame of its own (C1).
export { AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID } from "./call-subflow.ts";

export { controlFlowNodes } from "./definitions.ts";

export * from "./branch.ts";
export * from "./call-subflow.ts";
export * from "./end.ts";
export * from "./for-each.ts";
export * from "./handler-end.ts";
export * from "./handler.ts";
export * from "./loop.ts";
export * from "./merge.ts";
export * from "./parallel.ts";
export * from "./repeat.ts";
export * from "./shared.ts";
export * from "./start.ts";
export * from "./switch.ts";

export { automationStudioLifecycleEventApplies } from "./event-applies.ts";
