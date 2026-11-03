// The state a Router decides on.
//
// A Router's `state.*` conditions used to read `inputs.state`: whatever the
// caller happened to pass, which in every real run was nothing. A rule about
// the page could therefore never hold, and a model had nothing to write one
// about. The host now observes the state itself, through
// `observeRouteState`, at the moment the router decides -- and the same call
// is what a Flow build is shown, so the router decides on the state the model
// saw.
//
// The observation is used where it is made and never stored: a decision
// record keeps which paths were read and each rule's reason, not the values.
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioRouterExecutionInput, AutomationStudioRouterExecutionResult } from "../../../../flows/authoring/routing/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../../../runtime/automation-host/index.ts";
import { markObservedExecutionFrameUnknown, hasObservedExecutionFrame, type ExecutionCallbackObservation } from "../../../../runtime/execution-observation/index.ts";
import { assertAutomationEnumerableData } from "../../execution-admission/options/index.ts";
import { runExecutableRouter as runAutomationStudioRouter } from "../run.ts";
import { resolveAutomationStudioRouterState } from "./resolve.ts";

/**
 * Routes one run: the state its rules read, observed, then the router over
 * it. The one call a run makes, so no caller routes on a state nobody
 * observed.
 */
export async function routeAutomationStudioRun(input: Omit<AutomationStudioRouterExecutionInput, "currentStateSummary" | "stateSource"> & {
  callerState: JsonObject | null | undefined;
  hostRuntime?: AutomationStudioHostRuntimeBoundary | undefined;
  signal?: AbortSignal;
}, executionObservation?: ExecutionCallbackObservation): Promise<AutomationStudioRouterExecutionResult> {
  if (executionObservation) {
    if (!hasObservedExecutionFrame(executionObservation)) throw new Error("execution_observation.durable_frame_missing");
    try {
      assertAutomationEnumerableData(input);
    } catch (error) {
      markObservedExecutionFrameUnknown(executionObservation);
      throw error;
    }
  }
  const { callerState, hostRuntime, signal, ...routing } = input;
  const observed = await resolveAutomationStudioRouterState({ router: input.router, callerState, hostRuntime, projectId: input.projectId, flowId: input.flowId, ...(signal ? { signal } : {}) }, executionObservation);
  return runAutomationStudioRouter({ ...routing, currentStateSummary: observed.state, stateSource: observed.source }, executionObservation);
}
