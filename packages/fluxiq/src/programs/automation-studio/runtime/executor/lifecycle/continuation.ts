// What the dispatcher saves before a handler body runs, and how a body may
// end (state-aware recovery plan, C5).
//
// This module owns the two shapes. The rules that decide what a written
// disposition actually does are in `./dispositions.ts`. (Not to be confused
// with `../defensive/continuation.ts`, which decides whether a Flow may walk
// past a failed node.)

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLifecycleEvent } from "../../../nodes/control-flow/index.ts";
import type { AutomationStudioFramePath, AutomationStudioFramePhase } from "../frames/index.ts";

/**
 * What is known of the node's lasting act at the boundary: `none` when it has
 * no lasting act or has not acted yet, `landed` / `not_landed` when an effect
 * check settled it, `uncertain` when it may have acted and nothing settled it.
 */
export type AutomationStudioLastingActStatus = "none" | "landed" | "not_landed" | "uncertain";

/** The point the run resumes from once a handler body has ended. */
export type AutomationStudioLifecycleContinuation = {
  framePath: AutomationStudioFramePath;
  nodeId: string;
  /** The frame phase the event fired at. */
  phase: AutomationStudioFramePhase;
  event: AutomationStudioLifecycleEvent;
  attemptNumber: number;
  inputs: JsonObject;
  outputsSoFar: JsonObject;
  lastingActStatus: AutomationStudioLastingActStatus;
  incidentId?: string;
};

/** How a handler body ended, as its Handler End wrote it. */
export type AutomationStudioHandlerDisposition =
  | { kind: "resume" }
  | { kind: "route"; checkpointId: string }
  | { kind: "resolve"; outputs: JsonObject }
  | { kind: "unhandled" };
