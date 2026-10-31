// Where a from-step run starts (t804): a plan key resolved to the one node of
// the selected graph that carries it as `metadata.bootstrapSymbolicKey`
// (`../adaptation.ts` stamps every node a build writes). The whole-candidate
// runner (`./detached-execution.ts`) takes the key, never a caller's node id:
// a caller-supplied `options.startNodeId` stays refused there, and only a key
// resolved here, in the graph that is about to run, becomes the executor's
// `startNodeId`. A key no node carries, or more than one carries, refuses the
// run before anything acts.

import type { AutomationStudioFlowArtifact } from "../../../model/index.ts";

/** The longest plan key a from-step run is asked to start at; plan keys are short identifiers. */
const MAX_KEY_LENGTH = 128;

/** Whether `key` is a plan key a run may be asked to start at: a short non-blank string. */
export function automationStudioDetachedFromNodeKeyValid(key: unknown): key is string {
  return typeof key === "string" && key.trim() === key && key.length > 0 && key.length <= MAX_KEY_LENGTH;
}

/** The node id `key` names in `graph`, or the code refusing it; nothing when no key was asked. */
export function automationStudioDetachedFromNode(graph: Pick<AutomationStudioFlowArtifact, "nodes">, key: string | undefined): { nodeId: string } | { refused: string } | undefined {
  if (key === undefined) return undefined;
  const named = graph.nodes.filter((node) => node.metadata?.bootstrapSymbolicKey === key);
  if (!named.length) return { refused: "candidate.from_node_unknown" };
  if (named.length > 1) return { refused: "candidate.from_node_ambiguous" };
  return { nodeId: named[0]!.id };
}
