// The run's invocation frames as one structure (state-aware recovery plan, C1).
//
// This module owns the stack's type only. The run state carries it outermost
// first; the last frame is the one executing. A trace's `framePath` is the
// stack's invocation ids in the same order.

import type { AutomationStudioInvocationFrame } from "./invocation-frame.ts";

/** The active frames of a run, outermost first; the last one is executing. */
export type AutomationStudioFrameStack = readonly AutomationStudioInvocationFrame[];

/** The invocation ids of a frame stack, outermost first, as an attempt trace records them. */
export type AutomationStudioFramePath = readonly string[];
