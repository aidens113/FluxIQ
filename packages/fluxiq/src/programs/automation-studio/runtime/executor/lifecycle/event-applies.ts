// Which nodes a lifecycle event fires at (state-aware recovery plan, C3, C9).
//
// This module owns the one rule the step loop's dispatcher
// (`../step-loop/lifecycle-dispatch.ts`) and the Flow validator
// (`model/validation/flow.ts`) both read: `before`, `retry`, `fail` and
// `before_next` fire only at a step that acts on or reads the host -- a domain
// output, a recorded action, a Call Flow or a Call Subflow -- and never at Core
// plumbing, which does neither. A handler that fired before a Merge would ask
// the page about a step that does not touch it, and pay a fact check (and,
// when its `when` held, a whole body run) for nothing: run
// rmx-2026-10-10T07-05-26-548Z-41bb3f spent about six seconds on each such
// inert boundary. `start` is a frame's boundary, not a step's, so it fires at
// the frame's first node whatever that node is.

import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID, controlFlowNodes, type AutomationStudioLifecycleEvent } from "../../../nodes/control-flow/index.ts";

/** Wait (`nodes/timing/wait.ts`): a pause Core takes itself, which reads nothing on the host. */
const WAIT_DEFINITION_ID = "builtin.timing.wait";

/**
 * Core plumbing: every control-flow node but Call Subflow (Start, End, Merge,
 * Parallel, Branch, Switch, Loop, For Each, Repeat, Handler, Handler End), and
 * Wait. A control-flow node added later is plumbing until it says otherwise
 * here, which is the safe default: plumbing gets no handler.
 */
const PLUMBING_DEFINITION_IDS: ReadonlySet<string> = new Set([
  ...controlFlowNodes.map((definition) => definition.id).filter((id) => id !== AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID),
  WAIT_DEFINITION_ID
]);

/**
 * Whether `event` fires at `node`: `start` at any frame's first node, and every
 * other event only at a node that is not Core plumbing.
 */
export function automationStudioLifecycleEventApplies(event: AutomationStudioLifecycleEvent, node: Pick<AutomationStudioFlowNode, "definitionId">): boolean {
  return event === "start" || !PLUMBING_DEFINITION_IDS.has(node.definitionId);
}
