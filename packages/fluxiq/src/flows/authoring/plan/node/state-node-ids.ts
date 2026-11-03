/**
 * The nodes the state-aware recovery grammar is lowered into (contract C1, C4):
 * a step that calls a part, a handler's registration, and the end of a
 * handler's body. Reached only through the script's own statements
 * (`../script-statements/`), never by a step naming one, and read here so the
 * plan's validation can tell a handler's body and a called part from steps
 * nothing reaches.
 */
export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS = {
  callSubflow: "builtin.control.call-subflow",
  handler: "builtin.control.handler",
  handlerEnd: "builtin.control.handler-end"
} as const;
