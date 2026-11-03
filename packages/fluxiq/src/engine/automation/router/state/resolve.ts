import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowRouter } from "../../../../flows/authoring/routing/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../../../runtime/automation-host/index.ts";
import { observeAutomationStudioRouteState } from "../../../../runtime/automation-host/route-state/index.ts";
import { observedExecutionProperty, hasObservedExecutionFrame, type ExecutionCallbackObservation } from "../../../../runtime/execution-observation/index.ts";
import { automationStudioRouterStatePaths } from "./paths.ts";
import type { AutomationStudioRouterState } from "./state.ts";

/**
 * The state one routing decision reads. The host is asked only when a rule
 * reads `state.*`, so a Router over inputs alone costs the host nothing.
 * Keys the host returns take the place of the same keys a caller passed:
 * the observed page is the fact, a caller's copy of it is a claim.
 */
export async function resolveAutomationStudioRouterState(input: {
  router: AutomationStudioFlowRouter;
  callerState: JsonObject | null | undefined;
  hostRuntime?: AutomationStudioHostRuntimeBoundary | undefined;
  projectId: string;
  flowId: string;
  signal?: AbortSignal;
}, executionObservation?: ExecutionCallbackObservation): Promise<AutomationStudioRouterState> {
  if (executionObservation && !hasObservedExecutionFrame(executionObservation)) throw new Error("execution_observation.durable_frame_missing");
  const callerState = input.callerState ?? {};
  const paths = automationStudioRouterStatePaths(input.router);
  if (!paths.length) return { state: callerState, source: { observed: false, paths } };
  const observation = await observeAutomationStudioRouteState({
    hostRuntime: observedExecutionProperty(executionObservation, input, "hostRuntime"),
    projectId: input.projectId,
    flowId: input.flowId,
    ...(input.signal ? { signal: input.signal } : {})
  }, executionObservation);
  if (!observation.ok) return { state: callerState, source: { observed: false, paths, unavailable: observation.reason } };
  return { state: { ...callerState, ...observation.state }, source: { observed: true, paths } };
}
