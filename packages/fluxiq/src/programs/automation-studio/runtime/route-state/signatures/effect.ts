import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../host-runtime.ts";
import { automationStudioReadRouteSignature, type AutomationStudioRouteSignatureReading } from "./value.ts";

/** Whether a step's recorded effect is on the page now, and why not when it is not. */
export type AutomationStudioRouteEffectReading = { holds: true } | { holds: false; reason: string };

/**
 * The host's record of what one step did to the page, from the route state
 * before it and the route state after it, or why there is none: the host
 * records no effects, it threw, or it returned something that is not a small
 * JSON object.
 */
export function automationStudioSignRouteEffect(
  hostRuntime: AutomationStudioHostRuntimeBoundary | undefined,
  before: JsonObject,
  after: JsonObject
): AutomationStudioRouteSignatureReading {
  const sign = hostRuntime?.signRouteEffect;
  if (!sign) return { ok: false, reason: "The host records no step effects." };
  let effect: unknown;
  try {
    effect = sign.call(hostRuntime, before, after);
  } catch {
    return { ok: false, reason: "The host could not record the step's effect." };
  }
  return automationStudioReadRouteSignature(effect);
}

/**
 * Whether the page observed now already shows a step's recorded effect. Only
 * the host can say: Core holds the effect opaquely, and with no host to ask,
 * or a host that throws or answers anything but `true`, the effect is not
 * taken to hold. A step is passed over as already done only on the host's
 * positive answer.
 */
export function automationStudioRouteEffectHolds(
  hostRuntime: AutomationStudioHostRuntimeBoundary | undefined,
  effect: JsonObject,
  observed: JsonObject
): AutomationStudioRouteEffectReading {
  const holds = hostRuntime?.routeEffectHolds;
  if (!holds) return { holds: false, reason: "The host cannot tell whether a step's effect is on the page." };
  let answer: unknown;
  try {
    answer = holds.call(hostRuntime, effect, observed);
  } catch {
    return { holds: false, reason: "The host could not test the step's effect against the page." };
  }
  return answer === true ? { holds: true } : { holds: false, reason: "The page does not show the step's recorded effect." };
}
