// The ids and keys the handler views read, as Core names them. Core's
// `nodes/control-flow/handler.ts` and `handler-end.ts` own them; the public
// `fluxiq/automation-studio/nodes` entry does not export them, so they are
// repeated here, once, for every reader in the editor.

import type { FlowLifecycleEvent } from "./types";

/** `AUTOMATION_STUDIO_HANDLER_DEFINITION_ID`: the node that stores one registration. */
export const FLOW_HANDLER_DEFINITION_ID = "builtin.control.handler";

/** `AUTOMATION_STUDIO_HANDLER_END_DEFINITION_ID`: the node that ends a handler's body. */
export const FLOW_HANDLER_END_DEFINITION_ID = "builtin.control.handler-end";

/** `AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS`: the node and graph metadata of a Subflow contract (C2). */
export const FLOW_CONTRACT_KEYS = Object.freeze({
  entry: "fluxiq.entry",
  checkpoint: "fluxiq.checkpoint",
  successCheck: "fluxiq.successCheck",
  clearsInterference: "clearsInterference"
} as const);

/** `AUTOMATION_STUDIO_LIFECYCLE_EVENTS`, in the order they can occur around one node. */
export const FLOW_LIFECYCLE_EVENTS: readonly FlowLifecycleEvent[] = Object.freeze(["start", "before", "retry", "fail", "before_next"]);

/** `AUTOMATION_STUDIO_AUTHORED_PATH_ORDER`: an authored failure route comes after every conditional handler at its level. */
export const FLOW_AUTHORED_PATH_ORDER = Number.MAX_SAFE_INTEGER;
