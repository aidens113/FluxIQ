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
import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioFlowPort, AutomationStudioFlowRouter } from "../model/index.ts";
import { automationStudioRouteConditionPaths, buildAutomationStudioFlowBootstrapRoutingContext, type AutomationStudioFlowBootstrapRoutingContext } from "./flow-bootstrap/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "./host-runtime.ts";
import { runAutomationStudioRouter, type AutomationStudioRouterExecutionInput, type AutomationStudioRouterExecutionResult } from "./router-runtime.ts";

/** An observation larger than this is not a summary, and is not used. */
const MAX_ROUTE_STATE_BYTES = 32_768;

export type AutomationStudioRouteStateObservation =
  | { ok: true; state: JsonObject }
  | { ok: false; reason: string };

/** What the host can see now, or why nothing could be observed. Never throws. */
export async function observeAutomationStudioRouteState(input: {
  hostRuntime?: AutomationStudioHostRuntimeBoundary | undefined;
  projectId: string;
  flowId: string;
  signal?: AbortSignal;
}): Promise<AutomationStudioRouteStateObservation> {
  const observe = input.hostRuntime?.observeRouteState;
  if (!observe) return { ok: false, reason: "The host observes no state here, so only inputs.* can be tested." };
  let state: unknown;
  try {
    state = await Promise.resolve(observe.call(input.hostRuntime, {
      projectId: input.projectId,
      flowId: input.flowId,
      ...(input.signal ? { signal: input.signal } : {})
    }));
  } catch {
    return { ok: false, reason: "The host could not observe the state just now." };
  }
  if (!state || typeof state !== "object" || Array.isArray(state)) return { ok: false, reason: "The host returned no state." };
  let bytes: number;
  try {
    bytes = Buffer.byteLength(JSON.stringify(state), "utf8");
  } catch {
    return { ok: false, reason: "The host returned a state that is not JSON." };
  }
  if (bytes > MAX_ROUTE_STATE_BYTES) return { ok: false, reason: "The host returned more state than a route may read." };
  return { ok: true, state: state as JsonObject };
}

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

/** What a Flow build routes with, kept current as its exploration moves the page. */
export type AutomationStudioBuildRouting = {
  /** The routing context as it stands: the state where a run starts, then each distinct state exploration reached. */
  context(): AutomationStudioFlowBootstrapRoutingContext;
  /** An evidence-loop `decide` that first records the state any new evidence left behind. */
  observing<T extends { evidence: ReadonlyArray<{ toolId: string }>; signal?: AbortSignal | undefined }, R>(decide: (input: T) => Promise<R>): (input: T) => Promise<R>;
};

/**
 * Starts a build's routing context on a blank Flow: its declared inputs, the
 * state paths the host fills, and the state where a run would start -- the
 * state the router will decide on -- observed now, before any exploration.
 */
export async function startAutomationStudioBuildRouting(input: {
  hostRuntime?: AutomationStudioHostRuntimeBoundary | undefined;
  projectId: string;
  flowId: string;
  flowInputs: readonly AutomationStudioFlowPort[];
}): Promise<AutomationStudioBuildRouting> {
  const observations: Array<{ seen: string; state: JsonObject }> = [];
  const start = await observeAutomationStudioRouteState({ hostRuntime: input.hostRuntime, projectId: input.projectId, flowId: input.flowId });
  if (start.ok) observations.push({ seen: "where a run starts, before any step runs", state: start.state });
  let observedEvidence = 0;
  return {
    context: () => buildAutomationStudioFlowBootstrapRoutingContext({
      current: "The Flow is blank: it has no routes and no subflows yet.",
      flowInputs: input.flowInputs.map((port) => ({
        id: port.id,
        valueType: port.valueType.kind,
        ...(port.required ? { required: true } : {}),
        ...(port.description ? { description: port.description } : {})
      })),
      statePaths: input.hostRuntime?.routeStatePaths ?? [],
      observations,
      ...(start.ok ? {} : { stateUnavailable: start.reason })
    }),
    observing: (decide) => async (decision) => {
      // Only a host that could observe the start is asked again, and only
      // once per new piece of evidence: the tool that produced it may have
      // moved the page.
      if (start.ok && decision.evidence.length > observedEvidence) {
        observedEvidence = decision.evidence.length;
        const explored = await observeAutomationStudioRouteState({ hostRuntime: input.hostRuntime, projectId: input.projectId, flowId: input.flowId, ...(decision.signal ? { signal: decision.signal } : {}) });
        if (explored.ok) observations.push({ seen: `after exploring with ${decision.evidence.at(-1)?.toolId ?? "a tool"}`, state: explored.state });
      }
      return await decide(decision);
    }
  };
}
