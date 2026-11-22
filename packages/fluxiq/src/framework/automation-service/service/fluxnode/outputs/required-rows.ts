import type { JsonTypeSchema } from "@fluxiq/contracts/fluxnode";
import type { JsonObject } from "../../../../../core/index.ts";
import { fluxNodeShapedOutputs } from "./shaped-outputs.ts";

/** Ask the actual output mapper whether this declared shape consumes stored rows; do not guess from goal words or build a second schema classifier. */
export function fluxNodeOutputRequiresRows(type: JsonTypeSchema | undefined, inputs: JsonObject): boolean {
  if (type === undefined) return false;
  let required = false;
  fluxNodeShapedOutputs(type, { runId: "", flowId: "", inputs, acts: [] }, () => { required = true; });
  return required;
}
