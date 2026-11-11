// The library's nodes that can end a loop, said in a refusal of one that cannot.
//
// A span that repeats while its last step succeeds ends on a route that step
// answers when there is nothing more -- next-page's `ended` (contract C1). A
// last step with no such route, a plain press, could end the loop only by
// failing or at the Repeat's default bound, and assembly refuses it
// (`../draft-routing.ts`). The refusal never offers `most` as the way out: a
// count the person did not give caps the loop rather than ending it, and live
// run `run-mwblz4aq-0baa810a` capped a press at 20 passes and spent 19 of them
// on nothing. It names the nodes that do end one instead, read from the
// registry the Flow is assembled against, so Core names no domain node by hand.
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../../../framework/automation-service/nodes/index.ts";

/** The route a step answers when there is nothing more, which leaves a loop rather than failing it. */
const LOOP_ENDED_ROUTE = "ended";

/**
 * Every node of the library that declares the `ended` route among its `branch`
 * outputs, by the id the model runs it by and its label, as a parenthesis for a
 * refusal; empty when the library has none, so the refusal still says what the
 * step must do.
 */
export function automationStudioFlowLoopEndingNodesSaid(registry: AutomationStudioNodeRegistry, resolution: AutomationStudioNodeRegistryResolution): string {
  const nodes = registry.list(resolution).filter((definition) => definition.outputs.some((port) => port.role === "branch" && port.id === LOOP_ENDED_ROUTE));
  return nodes.length ? ` (in this library: ${nodes.map((node) => `${node.id}, "${node.label}"`).join("; ")})` : "";
}
