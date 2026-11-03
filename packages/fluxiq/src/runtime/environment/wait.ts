import type { ExecutionCallbackObservation } from "../execution-observation/index.ts";
import { observedExecutionProperty, invokeObservedExecutionCallbackSync, markObservedExecutionFrameUnknown, hasObservedExecutionFrame } from "../execution-observation/index.ts";
import { AutomationStudioEnvironmentClockBindings } from "./clock-bindings.ts";
import { automationStudioNativeDelay } from "./native-delay.ts";

/**
 * Every wait a graph run takes on its own account: between two attempts of a
 * node, for a pace between two starts of one, and for a Wait node's pause.
 *
 * A caller may supply its own `delay`, so a test or a simulator spends no wall
 * clock. The default timer is unreferenced -- a wait must never be the reason a
 * process stays alive -- and ends the moment the run is cancelled, so a
 * cancelled run is not held for the rest of a long pause. Whoever waited checks
 * the signal afterwards; the wait itself never throws.
 */
export async function automationStudioRunWait(options: { delay?: (ms: number, signal?: AbortSignal) => Promise<void>; signal?: AbortSignal }, waitMs: number, observation?: ExecutionCallbackObservation): Promise<void> {
  if (!(waitMs > 0)) return;
  if (observation && !hasObservedExecutionFrame(observation)) throw new Error("execution_observation.durable_frame_missing");
  const delay = observedExecutionProperty(observation, options, "delay");
  if (delay) {
    try {
      if (observation) AutomationStudioEnvironmentClockBindings.assert(delay);
      if (delay === automationStudioNativeDelay) await delay.call(options, waitMs, options.signal);
      else await invokeObservedExecutionCallbackSync(observation, { receiver: options, callback: delay, args: [waitMs, options.signal] });
    } catch (error) {
      if (observation) markObservedExecutionFrameUnknown(observation);
      throw error;
    }
    return;
  }
  await automationStudioNativeDelay(waitMs, options.signal);
}
