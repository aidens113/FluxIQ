// What the host can see of the state a route reads, and the one test any
// such state passes before a route or a model is shown it.
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../host-runtime.ts";

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
  return readAutomationStudioRouteState(state);
}

/**
 * A route state as a route may read it: a JSON object, of any size. The
 * one test for a state wherever it came from -- the host observing it now, or
 * a call reporting the page it left -- so neither is trusted further than the
 * other.
 */
export function readAutomationStudioRouteState(state: unknown): AutomationStudioRouteStateObservation {
  if (!state || typeof state !== "object" || Array.isArray(state)) return { ok: false, reason: "The host returned no state." };
  try {
    JSON.stringify(state);
  } catch {
    return { ok: false, reason: "The host returned a state that is not JSON." };
  }
  return { ok: true, state: state as JsonObject };
}
