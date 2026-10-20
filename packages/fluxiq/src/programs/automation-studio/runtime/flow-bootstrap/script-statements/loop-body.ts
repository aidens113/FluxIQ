// The steps one loop node runs again: every node on a cycle through it, read off
// a built plan's edges. A written repeat becomes a Repeat or a For Each whose
// body joins back before it (`../authoring/draft-routing.ts`), so a node reached
// from the loop node that also reaches it is one the loop runs on every pass.
//
// Shared by the two checks that read a built plan's loops: a record output
// replacing the run's rows on a looped step (`./record-replace-in-repeat.ts`)
// and a lasting act in a repeat whose listing orders its rows only in its
// saved answer (`./listing-order-in-repeat.ts`). Like `./statement-refusal.ts`
// it is how those checks read, not what the directory offers, so the barrel
// leaves it out.
import type { AutomationStudioFlowBootstrapSubflow } from "../plan/index.ts";

/** The keys of the nodes on a cycle through the loop node `loopKey`, the loop node aside. */
export function automationStudioFlowPlanLoopBody(subflow: AutomationStudioFlowBootstrapSubflow, loopKey: string): Set<string> {
  const forward = new Map<string, string[]>();
  const backward = new Map<string, string[]>();
  for (const edge of subflow.edges) {
    forward.set(edge.source.nodeKey, [...(forward.get(edge.source.nodeKey) ?? []), edge.target.nodeKey]);
    backward.set(edge.target.nodeKey, [...(backward.get(edge.target.nodeKey) ?? []), edge.source.nodeKey]);
  }
  // On a cycle through the loop node: reached from it, and reaching it.
  const reaches = reached(loopKey, backward);
  const body = new Set<string>();
  for (const key of reached(loopKey, forward)) if (key !== loopKey && reaches.has(key)) body.add(key);
  return body;
}

/** Every node reached from `start` along `next`. */
function reached(start: string, next: ReadonlyMap<string, readonly string[]>): Set<string> {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length) {
    for (const key of next.get(queue.pop()!) ?? []) {
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(key);
    }
  }
  return seen;
}
