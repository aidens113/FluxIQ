// Whether a call names something to act on, for telling a press with an effect from a
// move to an address (`../gate/act-gate.ts`, D6's undeclared press). Core's own words for
// the slots, and any value shaped like an address (`./address-shape.ts`).

import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioAttemptActIsAddress } from "./address-shape.ts";

const SLOTS: readonly string[] = ["target", "element", "handle"];

/** Whether any of a call's target slots is filled, or any parameter holds an address. */
export function automationStudioAttemptActHasTarget(parameters: JsonObject): boolean {
  if (SLOTS.some((slot) => parameters[slot] !== null && parameters[slot] !== undefined)) return true;
  return Object.values(parameters).some((value) => typeof value === "string" && automationStudioAttemptActIsAddress(value));
}
