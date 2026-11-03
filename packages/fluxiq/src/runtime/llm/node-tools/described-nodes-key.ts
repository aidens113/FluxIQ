// Where a node's definition reaches the model: the key on the result of the
// call that first described it (W11, t289-G).
//
// A call that newly describes nodes -- the library call that first runs one
// (`./describing-failures.ts`), or `core.describe_nodes` (`./describe-nodes.ts`)
// -- carries their ids under this key on its own result. The result is a window
// entry, and a window entry never changes or leaves once it is in, so the
// request puts each definition there, in place of its id, once
// (`../deepseek/request-body.ts`, which writes the same name on the wire).
// Nothing in front of the window changes when a node is described, which is
// what keeps the provider's prefix cache through it.

/** The key a call's result names the nodes it newly described under; on the wire it holds their definitions. */
export const AUTOMATION_STUDIO_LLM_DESCRIBED_NODES_KEY = "describedNodes";
