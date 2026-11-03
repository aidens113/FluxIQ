import { invokeObservedExecutionCallbackSync, observedExecutionProperty, type ExecutionCallbackObservation } from "../../execution-observation/index.ts";
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../index.ts";
import { automationStudioReadRouteSignature, type AutomationStudioRouteSignatureReading } from "./value.ts";

/** How a recorded signature compares with the one observed now. `closeness` is 0 to 1. */
export type AutomationStudioRouteSignatureComparison = { matches: boolean; closeness: number };

/**
 * The host's signature of one route state, or why there is none: the host
 * signs no states, it threw, or it returned something that is not a small
 * JSON object.
 */
export function automationStudioSignRouteState(hostRuntime: AutomationStudioHostRuntimeBoundary | undefined, state: JsonObject, executionObservation?: ExecutionCallbackObservation): AutomationStudioRouteSignatureReading {
  const sign = hostRuntime ? observedExecutionProperty(executionObservation, hostRuntime, "signRouteState") : undefined;
  if (!sign) return { ok: false, reason: "The host signs no route states." };
  let signature: unknown;
  try {
    signature = invokeObservedExecutionCallbackSync(executionObservation, { receiver: hostRuntime, callback: sign, args: [state] });
  } catch {
    return { ok: false, reason: "The host could not sign the route state." };
  }
  return automationStudioReadRouteSignature(signature);
}

/**
 * Whether a recorded signature describes the state observed now. The host
 * decides when it can; a host that cannot is held to structural equality,
 * which is generic and never fuzzy. A host that throws, or answers in another
 * shape, is read as no match: a route is taken only on a match the host stated.
 */
export function automationStudioCompareRouteSignatures(
  hostRuntime: AutomationStudioHostRuntimeBoundary | undefined,
  recorded: JsonObject,
  observed: JsonObject,
  executionObservation?: ExecutionCallbackObservation
): AutomationStudioRouteSignatureComparison {
  const compare = hostRuntime ? observedExecutionProperty(executionObservation, hostRuntime, "compareRouteSignatures") : undefined;
  if (!compare) {
    const equal = jsonEqual(recorded, observed);
    return { matches: equal, closeness: equal ? 1 : 0 };
  }
  let answer: unknown;
  try {
    answer = invokeObservedExecutionCallbackSync(executionObservation, { receiver: hostRuntime, callback: compare, args: [recorded, observed] });
  } catch {
    return { matches: false, closeness: 0 };
  }
  if (!answer || typeof answer !== "object") return { matches: false, closeness: 0 };
  const { matches, closeness } = answer as { matches?: unknown; closeness?: unknown };
  if (typeof matches !== "boolean" || typeof closeness !== "number" || !Number.isFinite(closeness)) return { matches: false, closeness: 0 };
  return { matches, closeness: Math.min(1, Math.max(0, closeness)) };
}

/** Structural equality of two JSON values, key order ignored. */
function jsonEqual(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => jsonEqual(item, right[index]));
  }
  const leftKeys = Object.keys(left).filter((key) => left[key] !== undefined);
  const rightKeys = Object.keys(right).filter((key) => right[key] !== undefined);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => jsonEqual(left[key], right[key]));
}
