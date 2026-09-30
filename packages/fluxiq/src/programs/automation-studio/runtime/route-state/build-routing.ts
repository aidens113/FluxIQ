// The routing context a Flow build is shown, kept current as its exploration
// moves the page.
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowPort } from "../../model/index.ts";
import { buildAutomationStudioFlowBootstrapRoutingContext, type AutomationStudioFlowBootstrapRoutingContext } from "../flow-bootstrap/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../host-runtime.ts";
import { observeAutomationStudioRouteState, readAutomationStudioRouteState, type AutomationStudioRouteStateObservation } from "./observe.ts";

/** What a Flow build routes with, kept current as its exploration moves the page. */
export type AutomationStudioBuildRouting = {
  /** The routing context as it stands: the state where a run starts, then each distinct state exploration reached. */
  context(): AutomationStudioFlowBootstrapRoutingContext;
  /**
   * An evidence-loop `decide` that first records the state the newest call
   * left, when a call ran since the last decision: from that call's own
   * `routeState`, or observed when it carried none.
   */
  observing<T extends { signal?: AbortSignal | undefined }, R>(decide: (input: T) => Promise<R>): (input: T) => Promise<R>;
  /**
   * An evidence-loop `executeTool` that keeps the route state each call
   * reports about the page it left. Every call the loop makes goes through it,
   * the dry run's replayed steps included.
   */
  recording<C extends { callId: string; toolId: string; signal?: AbortSignal | undefined }, X>(executeTool: (call: C) => Promise<X>): (call: C) => Promise<X>;
};

/** How the evidence loop names its free first look (`../llm/evidence-loop.ts`): `initial.<toolId>`. */
const FREE_FIRST_LOOK_CALL_PREFIX = "initial.";

const START_SEEN = "where a run starts, before any step runs";

/**
 * Starts a build's routing context on a blank Flow: its declared inputs, the
 * state paths the host fills, and the state where a run would start -- the
 * state the router will decide on.
 *
 * **Where the states come from.** Each is the page's route state, which the
 * host fills a whole page capture to learn (`observeRouteState`). Asked before
 * the build and again before every decision whose shown evidence grew, that
 * was the largest browser cost a decision had left once t196 removed the
 * digest captures -- and most of it re-read a page a call had just captured
 * for itself. So a call may report the route state of the page it left
 * (`routeState` on its execution result, `../llm/evidence-loop/tool-execution.ts`)
 * and the build reads that instead. The host is asked only where no call has
 * left a current one: after a call that carried none, and for the start when
 * the look that stands for it carried none.
 *
 * **When a state is recorded.** Before a decision, when a call ran since the
 * last one -- not when the decision is shown more entries. A note of Core's own
 * (the budget, feedback, an answer from memory) and a window that shifts moved
 * no page, so they record nothing.
 *
 * **The start** (`start`). `"now"` observes it here, before anything runs: a
 * build that writes its Flow in one reply has no call to read it from.
 * `"first_look"` takes it from the evidence loop's free first look, which only
 * looks, so the page it reports is the page a run starts on; when the look
 * carried none it is observed right after the look. When the loop's first call
 * is not that look (it has none, or it threw), the start is observed before
 * that call runs, and when nothing has run, at the first decision. A host that
 * cannot observe its state at all is not deferred to: a Router could not read
 * what a call reported, so the context says the state is unavailable, as
 * before.
 */
export async function startAutomationStudioBuildRouting(input: {
  hostRuntime?: AutomationStudioHostRuntimeBoundary | undefined;
  projectId: string;
  flowId: string;
  flowInputs: readonly AutomationStudioFlowPort[];
  start?: "now" | "first_look";
}): Promise<AutomationStudioBuildRouting> {
  const observations: Array<{ seen: string; state: JsonObject }> = [];
  const observe = (signal: AbortSignal | undefined) => observeAutomationStudioRouteState({ hostRuntime: input.hostRuntime, projectId: input.projectId, flowId: input.flowId, ...(signal ? { signal } : {}) });
  // Unsettled only while a deferred start waits for the free first look.
  let start: AutomationStudioRouteStateObservation | undefined;
  const settleStart = (observation: AutomationStudioRouteStateObservation): void => {
    start = observation;
    if (observation.ok) observations.push({ seen: START_SEEN, state: observation.state });
  };
  if (input.start !== "first_look" || !input.hostRuntime?.observeRouteState) settleStart(await observe(undefined));
  // The newest call, and the state it left when that is known; whether it ran since the last decision.
  let newest: { toolId: string; state?: JsonObject } | undefined;
  let calls = 0;
  let ranSinceObserved = false;
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
      ...(start && !start.ok ? { stateUnavailable: start.reason } : {})
    }),
    recording: <C extends { callId: string; toolId: string; signal?: AbortSignal | undefined }, X>(executeTool: (call: C) => Promise<X>) => async (call: C): Promise<X> => {
      const freeFirstLook = calls === 0 && call.callId.startsWith(FREE_FIRST_LOOK_CALL_PREFIX);
      calls += 1;
      // Anything else may move the page, so the start is read before it does.
      if (!start && !freeFirstLook) settleStart(await observe(call.signal));
      const ran: { toolId: string; state?: JsonObject } = { toolId: call.toolId };
      let result: X;
      try {
        result = await executeTool(call);
      } finally {
        // A call that threw may still have moved the page; it reports nothing, so the next decision observes.
        newest = ran;
        ranSinceObserved = true;
      }
      const carried = reportedRouteState(result);
      if (carried) ran.state = carried;
      if (!start && freeFirstLook) {
        const observed = carried ? { ok: true as const, state: carried } : await observe(call.signal);
        settleStart(observed);
        // Observed right after the look, so it is also the state the look left.
        if (observed.ok) ran.state = observed.state;
      }
      return result;
    },
    observing: (decide) => async (decision) => {
      // What the page is now, once anything has had to learn it.
      let current: AutomationStudioRouteStateObservation | undefined = ranSinceObserved && newest?.state ? { ok: true, state: newest.state } : undefined;
      if (!start) settleStart(current ??= await observe(decision.signal));
      // Only a host that could observe the start is asked again, and only
      // when a call ran since the last decision: that call may have moved the page.
      if (start?.ok && ranSinceObserved) {
        ranSinceObserved = false;
        current ??= await observe(decision.signal);
        if (current.ok) observations.push({ seen: `after exploring with ${newest?.toolId ?? "a tool"}`, state: current.state });
      }
      return await decide(decision);
    }
  };
}

/** The route state a call reported about the page it left, when it reported a usable one. */
function reportedRouteState(result: unknown): JsonObject | undefined {
  if (!result || typeof result !== "object" || Array.isArray(result)) return undefined;
  const execution = result as { kind?: unknown; routeState?: unknown };
  if (execution.kind !== "llm_evidence_tool_execution" || execution.routeState === undefined) return undefined;
  const read = readAutomationStudioRouteState(execution.routeState);
  return read.ok ? read.state : undefined;
}
