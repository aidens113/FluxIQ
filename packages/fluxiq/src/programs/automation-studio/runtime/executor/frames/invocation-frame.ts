// One invocation of a graph, as explicit data (state-aware recovery plan, C1).
//
// This module owns the frame's shape and nothing else. A run's frames form a
// stack (`./stack.ts`) that scope resolution, traces and later persistence all
// read; JavaScript recursion may still carry the execution, but where the run
// is lives here rather than on the call stack.

import type { JsonObject } from "../../../../../core/index.ts";

/**
 * Where a frame's cursor stands relative to its node:
 * - `before_attempt`: about to attempt the node (On Before fires here);
 * - `before_retry`: Core has permitted another attempt (On Retry fires here);
 * - `before_next`: the node succeeded and the edge is not chosen yet;
 * - `failed`: the node's retries are spent or its failure is not retryable;
 * - `handler`: a handler body is running for this frame, and no handler is
 *   dispatched again until it ends (C5: no nesting).
 */
export const AUTOMATION_STUDIO_FRAME_PHASES = Object.freeze(["before_attempt", "before_retry", "before_next", "failed", "handler"] as const);

/** One position of a frame's cursor relative to its node. */
export type AutomationStudioFramePhase = (typeof AUTOMATION_STUDIO_FRAME_PHASES)[number];

/** Where the frame began: its graph's Start node, an alternative entry, or a recovery checkpoint (C2). */
export type AutomationStudioFrameEntry =
  | { kind: "default"; id?: undefined }
  | { kind: "entry" | "checkpoint"; id: string };

/** The node a frame is at, and where it stands relative to it. */
export type AutomationStudioFrameCursor = {
  nodeId: string;
  phase: AutomationStudioFramePhase;
};

/**
 * One invocation of a graph: the Router-selected Subflow a run begins in, a
 * child a Call Subflow node runs, or the root graph of a run without Subflows
 * (`subflowId: null`).
 *
 * `graphFlowId` is the graph's identity for scope resolution: a registration
 * stored in a graph applies to the frames running that graph.
 * `graphRevision` is `null` where the graph has no revision chain yet, as
 * `runtime/flow-version/contracts.ts` records it. `incidentId` is set while a
 * recovery incident is open on this frame (C7).
 */
export type AutomationStudioInvocationFrame = {
  invocationId: string;
  parentInvocationId?: string;
  /** The Call Subflow node in the parent frame that started this one. */
  callNodeId?: string;
  subflowId: string | null;
  graphFlowId: string;
  graphRevision: number | null;
  entry: AutomationStudioFrameEntry;
  inputs: JsonObject;
  outputs: JsonObject;
  cursor: AutomationStudioFrameCursor;
  incidentId?: string;
};
