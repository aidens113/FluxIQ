import type { ExecutionCallbackObservation } from "../../../../runtime/execution-observation/index.ts";
import { observedExecutionProperty, invokeObservedExecutionCallbackSync, markObservedExecutionFrameUnknown, hasObservedExecutionFrame } from "../../../../runtime/execution-observation/index.ts";
import { NativeClock, originalNativeClockFunctions } from "../../../../framework/clock/native/index.ts";
import { automationStudioLiveRunEnvironment, AutomationStudioEnvironmentClockBindings } from "../../../../runtime/environment/index.ts";

/** Pins the chosen callback, retaining its receiver and checking live delegates at use. */
export function automationObservedClock(observation: ExecutionCallbackObservation | undefined, input: { now?: (() => number) | undefined }, receiver: unknown): () => number {
  const callback = observedExecutionProperty(observation, input, "now");
  let refused: { readonly error: unknown } | undefined;
  return () => {
    if (!observation) return callback?.call(receiver) ?? Date.now();
    if (refused) throw refused.error;
    if (!hasObservedExecutionFrame(observation)) throw new Error("execution_observation.durable_frame_missing");
    try {
      AutomationStudioEnvironmentClockBindings.assert(callback);
      if (callback === automationStudioLiveRunEnvironment.now) {
        NativeClock.assert("now");
        return callback.call(receiver);
      }
      if (callback && callback === originalNativeClockFunctions.now) return callback.call(receiver);
      if (callback) return invokeObservedExecutionCallbackSync(observation, { receiver, callback, args: [] }) ?? NativeClock.now();
      return NativeClock.now();
    } catch (error) {
      refused = { error };
      markObservedExecutionFrameUnknown(observation);
      throw error;
    }
  };
}
