// Whether the node library a build was given can be told where to go at all.
//
// Asked first, because a refusal a build cannot act on is worse than no
// refusal. A bound domain that registers no node which takes a destination --
// nothing that opens an address, nothing that resumes a session -- cannot reach
// its start location however the model writes its Flow, and refusing there
// would send the exploration round its budget looking for a node that does not
// exist, which is the rewrite loop the whole check exists to avoid. So such a
// library leaves the Flow exactly where it stood.
//
// What counts is a node the domain registered with a required value the model
// writes freely, because a start location is text in the domain's own spelling
// and nothing else can hold one: an enumerated choice is a fixed list, and a
// reference names something already registered. The question is only whether a
// destination is expressible. It is not an attempt to say which node goes
// there -- that belongs to the domain, and `./plan-locations.ts` answers it
// from the value the step was written with rather than from the node.
import type { AutomationNodeParameter, AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";

/** Controls whose value the model writes freely; `undefined` is a plain value with no editor hint. */
const FREE_TEXT_CONTROLS: ReadonlySet<string> = new Set(["text", "textarea"]);

/** True when some node this build may use can be told, in free text, where to go. */
export function automationStudioFlowBootstrapLibraryTakesALocation(input: {
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
}): boolean {
  return input.registry.list(input.resolution)
    .some((definition) => definition.availability.kind === "domain" && definition.parameters.some(takesFreeText));
}

function takesFreeText(parameter: AutomationNodeParameter): boolean {
  if (parameter.required !== true || parameter.valueType !== "string" || parameter.options?.length) return false;
  return parameter.ui === undefined || FREE_TEXT_CONTROLS.has(parameter.ui.control);
}
