import type { AutomationStudioFlowGraphVersion } from "./contracts.ts";

/**
 * The version set of one run: every graph Flow it entered, each named once.
 *
 * Only graphs the run actually executed belong in it. A Subflow the router did
 * not select was not judged and must never be rolled back for a verdict it had
 * no part in, and the counter-case -- a router change that made the wrong
 * Subflow reachable -- is already covered, because the orchestration Flow is
 * its own versioned unit and carries its own entry.
 *
 * A graph named twice keeps its first position and its last value, which is
 * what makes a re-run after a repair restate its own entry: the repaired graph
 * is at a new revision, and the set the verdict is written against has to be
 * the one that just ran, not the one that was replaced.
 */
export function automationStudioRunFlowVersions(
  entries: readonly (AutomationStudioFlowGraphVersion | undefined)[]
): AutomationStudioFlowGraphVersion[] {
  const byGraphFlowId = new Map<string, AutomationStudioFlowGraphVersion>();
  for (const entry of entries) {
    if (!entry || !entry.graphFlowId) continue;
    byGraphFlowId.set(entry.graphFlowId, entry);
  }
  return [...byGraphFlowId.values()];
}
