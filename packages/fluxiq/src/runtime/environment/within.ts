import type { ExecutionCallbackObservation } from "../execution-observation/index.ts";
import { hasObservedExecutionFrame, invokeObservedExecutionCallbackSync, markObservedExecutionFrameUnknown, observedExecutionProperty } from "../execution-observation/index.ts";
import type { AutomationStudioRunEnvironment } from "./environment.ts";
import { AutomationStudioEnvironmentClockBindings } from "./clock-bindings.ts";
import { automationStudioLiveRunEnvironment } from "./live.ts";

/** Enters the original environment while retaining the caller's existing execution lineage. */
export async function withinAutomationStudioRunEnvironment<T>(environment: AutomationStudioRunEnvironment, work: () => Promise<T>, observation?: ExecutionCallbackObservation): Promise<T> {
  if (observation && !hasObservedExecutionFrame(observation)) throw new Error("execution_observation.durable_frame_missing");
  const callback = observedExecutionProperty(observation, environment, "within");
  try {
    if (observation) AutomationStudioEnvironmentClockBindings.assert(callback);
    // This exact immutable Core body only forwards the original work. Its caller owns that work's children.
    return await (callback === automationStudioLiveRunEnvironment.within
      ? callback.call(environment, work)
      : invokeObservedExecutionCallbackSync(observation, { receiver: environment, callback, args: [work] })) as T;
  } catch (error) {
    if (observation) markObservedExecutionFrameUnknown(observation);
    throw error;
  }
}
