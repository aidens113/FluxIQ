import { CALL_FLOW_NODE_TYPE } from "@fluxiq/contracts/fluxnode";

/**
 * The node types a compiled pipeline uses. A map is a Call Flow node, the contract's
 * own type. The first records and every other data step are nodes whose parameters
 * carry the declaration, so the editor and the run logs show them as ordinary steps.
 * The existing `builtin.data.*` nodes compare one field with one value and write
 * through a record output; a declared expression is richer than they are, so none of
 * them can stand in for a step without changing what it computes.
 */
export const PIPELINE_NODE_TYPES = Object.freeze({
  source: "builtin.data.pipeline-source",
  step: "builtin.data.pipeline-step",
  callFlow: CALL_FLOW_NODE_TYPE
});

/** The id of the node that loads the first records. Not a valid step id, so no step can take it. */
export const PIPELINE_SOURCE_NODE_ID = "__source";

/** The port a join takes its right side on; the left side arrives on the default port. */
export const PIPELINE_JOIN_RIGHT_PORT = "right";
