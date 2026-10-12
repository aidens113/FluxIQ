import { branchNode } from "./branch.ts";
import { callSubflowNode } from "./call-subflow.ts";
import { endNode } from "./end.ts";
import { forEachNode } from "./for-each.ts";
import { handlerNode } from "./handler.ts";
import { handlerEndNode } from "./handler-end.ts";
import { loopNode } from "./loop.ts";
import { mergeNode } from "./merge.ts";
import { parallelNode } from "./parallel.ts";
import { repeatNode } from "./repeat.ts";
import { startNode } from "./start.ts";
import { switchNode } from "./switch.ts";

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

export const controlFlowNodes = [startNode, endNode, branchNode, switchNode, parallelNode, mergeNode, loopNode, forEachNode, repeatNode, handlerNode, handlerEndNode, callSubflowNode];
