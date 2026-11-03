// Building onto a Flow that already exists, rather than onto a blank one.
//
// **What this is for.** A run that executed every step and still answered the
// wrong question has a Flow missing a step, not a step that broke. The loop
// that can find the missing step is the build's own, and the build was closed
// to exactly these Flows: `assertBlankBootstrapTarget` refused anything with a
// node in it, so the only Flow the model could be asked to work on was one that
// did not exist yet. `AutomationStudioBootstrapAdaptationMode` has named the
// other door since modes were introduced (`./adaptation.ts`) and nothing ever
// walked through it. This module is what walks through it.
//
// **An extend is an edit, and an edit keeps its ids.** Creation mints every id
// from a hash of the adaptation id, which is right for a topology that did not
// exist a moment ago and wrong for one that did: re-minting them turns "add the
// search step the Flow was missing" into "replace the Flow with a new one that
// happens to contain most of the same nodes", and everything that pointed at
// the old nodes -- provenance, stability, a person's hand edits -- is lost. So
// an extend carries the ids the Flow already has, and normalisation reuses
// them wherever it is given one (`./adaptation.ts`,
// `normalizeAutomationStudioFlowBuildPlan`).
//
// **Which ids, and how they are known.** The correspondence is not guessed from
// node definitions, which would pair two `web.dom.click` steps by luck. The
// build starts from the Flow read back as a draft
// (`runtime/llm/node-tools/draft-from-flow.ts`), each seeded step remembers the
// node it stands for, and the assembler numbers plan nodes in the order of the
// steps it was given -- so the map from plan key to existing node id is read
// off the draft the model actually amended. A step the model dropped takes its
// node's id out of the map with it, which is how "remove this node" is said.
//
// **One Subflow.** A plan assembled from a draft has exactly one block
// (`authoring/assemble-draft.ts`), so an extend has exactly one Subflow and one
// graph Flow to write back into, and the ids reused are that Subflow's, that
// graph Flow's and the Router's.

import type { AutomationStudioBootstrapAdaptationMode } from "./adaptation.ts";

/**
 * The ids an extend keeps, so the Flow is edited rather than replaced.
 *
 * Stored on the adaptation, because apply re-normalises the plan and compares
 * the result with the topology that was proposed: a normalisation that could
 * not see these ids would mint new ones and the comparison would refuse the
 * record it was checking.
 */
export type AutomationStudioBootstrapExistingTopology = {
  /** The Router the Flow already has. Absent mints one, as creation does. */
  routerId?: string;
  /** The primary Subflow an extend writes back into, and its graph Flow. */
  subflowId?: string;
  graphFlowId?: string;
  /**
   * Which existing node each plan node key is, for the keys that came from a
   * seeded step. A key absent here is a node the build added, and minting an id
   * for that one is right.
   */
  nodeIdByKey?: Record<string, string>;
};

/**
 * Why this Flow may not be built onto in this mode, or `undefined` when it may.
 *
 * Creation's rule is unchanged, word for word in what it refuses: a top-level
 * orchestration Flow with no node, no edge, no Router and no Subflow. An extend
 * inverts only the second half -- the parent is still an orchestration Flow
 * whose own graph is empty, because a bootstrap-built Flow keeps its steps in a
 * Subflow's graph rather than in the parent, and there must be something there
 * to extend. A Flow with no Router and no Subflow is not an edit's subject; it
 * is creation's, and saying so is more useful than building a second Flow
 * beside the first.
 */
export function automationStudioBootstrapTargetRefusal(input: {
  mode: AutomationStudioBootstrapAdaptationMode;
  /** How the Flow is persisted; only an orchestration Flow is ever a target. */
  representation: string;
  parentNodeCount: number;
  parentEdgeCount: number;
  hasRouter: boolean;
  subflowCount: number;
}): string | undefined {
  if (input.representation !== "orchestration" || input.parentNodeCount || input.parentEdgeCount) {
    return "Flow Bootstrap requires a blank top-level orchestration Flow.";
  }
  if (input.mode === "create") {
    if (input.hasRouter) return "Flow Bootstrap requires a Flow without a Router.";
    if (input.subflowCount > 0) return "Flow Bootstrap requires a Flow without Subflows.";
    return undefined;
  }
  if (!input.hasRouter || input.subflowCount === 0) {
    return "Extending a Flow requires a Flow that already has a Router and a Subflow; build one instead.";
  }
  return undefined;
}

/**
 * The Subflow an extend writes back into: the primary one, or the only one.
 *
 * A plan assembled from a draft holds one Subflow, so an extend has one place
 * to put it. A Flow whose Subflows do not say which is primary and has more
 * than one answers nothing, and the caller then extends without reusing the
 * Subflow's id -- which is a replacement, and refused upstream rather than
 * guessed at here.
 */
export function automationStudioBootstrapExtendSubflow(
  subflows: readonly { subflowId: string; graphFlowId?: string; role?: string; status?: string }[]
): { subflowId: string; graphFlowId: string } | undefined {
  // A Subflow with no graph Flow has no steps to read back, and one that is not
  // active is not what the run executed.
  const usable = subflows.filter((subflow): subflow is { subflowId: string; graphFlowId: string; role?: string; status?: string } =>
    typeof subflow.graphFlowId === "string" && subflow.graphFlowId.length > 0 && (subflow.status === undefined || subflow.status === "active"));
  const primary = usable.filter((subflow) => subflow.role === "primary");
  const found = primary.length === 1 ? primary[0] : usable.length === 1 ? usable[0] : undefined;
  return found ? { subflowId: found.subflowId, graphFlowId: found.graphFlowId } : undefined;
}
