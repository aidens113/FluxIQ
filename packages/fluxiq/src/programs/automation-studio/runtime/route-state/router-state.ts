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
import type { AutomationStudioFlowRouter } from "../../model/index.ts";
import { automationStudioRouteConditionPaths } from "../flow-bootstrap/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../host-runtime.ts";
import { runAutomationStudioRouter, type AutomationStudioRouterExecutionInput, type AutomationStudioRouterExecutionResult } from "../router-runtime.ts";
import { observeAutomationStudioRouteState } from "./observe.ts";

/** The `state.*` paths the router's active rules read, each once, in rule order. */
export function automationStudioRouterStatePaths(router: AutomationStudioFlowRouter): string[] {
  const paths: string[] = [];
  for (const rule of router.rules) {
    if (rule.status !== "active") continue;
    for (const path of automationStudioRouteConditionPaths(rule.condition)) {
      if (path.startsWith("state.") && !paths.includes(path)) paths.push(path);
    }
  }
  return paths;
}

export type AutomationStudioRouterState = {
  /** What `state.*` resolves against: the caller's state, with what the host observed over it. */
  state: JsonObject;
  /** What the decision record says about where the state came from. Values are never kept. */
  source: { observed: boolean; paths: string[]; unavailable?: string };
};

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
}): Promise<AutomationStudioRouterState> {
  const callerState = input.callerState ?? {};
  const paths = automationStudioRouterStatePaths(input.router);
  if (!paths.length) return { state: callerState, source: { observed: false, paths } };
  const observation = await observeAutomationStudioRouteState({
    hostRuntime: input.hostRuntime,
    projectId: input.projectId,
    flowId: input.flowId,
    ...(input.signal ? { signal: input.signal } : {})
  });
  if (!observation.ok) return { state: callerState, source: { observed: false, paths, unavailable: observation.reason } };
  return { state: { ...callerState, ...observation.state }, source: { observed: true, paths } };
}

/**
 * Routes one run: the state its rules read, observed, then the router over
 * it. The one call a run makes, so no caller routes on a state nobody
 * observed.
 */
export async function routeAutomationStudioRun(input: Omit<AutomationStudioRouterExecutionInput, "currentStateSummary" | "stateSource"> & {
  callerState: JsonObject | null | undefined;
  hostRuntime?: AutomationStudioHostRuntimeBoundary | undefined;
  signal?: AbortSignal;
}): Promise<AutomationStudioRouterExecutionResult> {
  const { callerState, hostRuntime, signal, ...routing } = input;
  const observed = await resolveAutomationStudioRouterState({ router: input.router, callerState, hostRuntime, projectId: input.projectId, flowId: input.flowId, ...(signal ? { signal } : {}) });
  return runAutomationStudioRouter({ ...routing, currentStateSummary: observed.state, stateSource: observed.source });
}
