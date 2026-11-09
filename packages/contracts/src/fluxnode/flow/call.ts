// Call Flow (plan, O1): any Flow may call any other Flow in its project. It replaces
// the retired step that called a part, keeping its invocation frames, entries,
// checkpoints and success check; only the name and the target change.

import { z } from "zod";
import { fluxNodeFieldSchemas } from "../fields/index.ts";
import { fluxNodeNameSchema } from "./fluxnode-name.ts";

/** The node type of a Call Flow step in a Flow graph. */
export const CALL_FLOW_NODE_TYPE = "builtin.control.call-flow";

/**
 * What a call names: a Flow by its id, which survives moves and renames, or a
 * FluxNode by its registered name, which resolves to that FluxNode's current learned
 * Flow when the call runs. Never a path.
 */
export const flowCallTargetSchema = z.union([
  z.object({ flowId: fluxNodeFieldSchemas.id }).strict(),
  z.object({ fluxNode: fluxNodeNameSchema }).strict()
]);

export type FlowCallTarget = z.infer<typeof flowCallTargetSchema>;
