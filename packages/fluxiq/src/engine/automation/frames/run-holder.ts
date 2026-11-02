// The run holder: the one object every frame of a run shares (state-aware
// recovery plan, C1, C7). Created once per run, by whichever entry frames the
// run as its root, and handed to every child frame by reference.

import { automationStudioLifecycleRunState } from "../lifecycle-run/index.ts";
import type { AutomationStudioRunFrames, AutomationStudioSubflowGraphRunner } from "./invocation-options.ts";

/**
 * A new run holder with an empty stack and a lifecycle state that has spent
 * nothing. Invocation ids are numbered within the run (`invocation-1`,
 * `invocation-2`, ...), so a trace's `framePath` reads the same however often
 * the run is replayed in a test.
 */
export function automationStudioRunFrames(runSubflow?: AutomationStudioSubflowGraphRunner): AutomationStudioRunFrames {
  let issued = 0;
  return {
    stack: [],
    nextInvocationId: () => `invocation-${(issued += 1)}`,
    lifecycle: automationStudioLifecycleRunState(),
    subflowOverrides: new Map(),
    ...(runSubflow ? { runSubflow } : {})
  };
}
