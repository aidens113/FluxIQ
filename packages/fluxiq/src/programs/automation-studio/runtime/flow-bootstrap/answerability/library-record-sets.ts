// Whether the node library a build was given can produce a set of records at
// all.
//
// Asked first, because a refusal a build cannot act on is worse than no refusal.
// A bound domain that registers nothing which returns rows -- no extraction, no
// query, no reader of a collection -- makes a records answer impossible however
// the model writes its Flow, and refusing there would send the exploration round
// its budget asking for a node that does not exist, which is the rewrite loop
// this whole check exists to avoid. So a library with no way to produce rows
// leaves the Flow exactly where it stood before.
//
// The question is about a node's *own* result, which is why it reads the
// declared records path rather than the supplied one. Core's node that writes
// records supplies a path and produces nothing by itself: it saves the rows
// another step handed it, so a library holding only that node still cannot
// answer a request for rows. The same is true of Core's policy action, whose
// rows are whatever the domain output it dispatches returned.
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import { automationStudioFlowBootstrapDeclaredRecordsPath } from "../plan/index.ts";

/** True when some node this build may use returns a set of records of its own. */
export function automationStudioFlowBootstrapLibraryReturnsRecords(input: {
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
}): boolean {
  return input.registry.list(input.resolution)
    .some((definition) => automationStudioFlowBootstrapDeclaredRecordsPath(definition) !== undefined);
}
