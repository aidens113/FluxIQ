// What a pipeline step calls: a FluxNode (by object or name) or a Flow by id.

import type { FlowCallTarget } from "@fluxiq/contracts/fluxnode";

/** A FluxNode defined in code, its registered name, or a Flow's id. */
export type FlowTargetInput = string | { readonly name: string } | { flowId: string };

/** The contracts' call target for `target`. */
export function flowTarget(target: FlowTargetInput): FlowCallTarget {
  if (typeof target === "string") return { fluxNode: target };
  if ("flowId" in target) return { flowId: target.flowId };
  return { fluxNode: target.name };
}
