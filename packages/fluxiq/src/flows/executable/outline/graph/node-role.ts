// What a node is to the outline, read off its definition id alone.
import {
  AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID,
  AUTOMATION_STUDIO_HANDLER_DEFINITION_ID,
  AUTOMATION_STUDIO_HANDLER_END_DEFINITION_ID
} from "../../../../components/automation/control-flow/index.ts";
import { PIPELINE_NODE_TYPES } from "../../../../framework/automation-service/service/pipelines/compile/index.ts";
import { getCallFlowConfiguration } from "../../composite/index.ts";
import type { AutomationStudioFlowNode } from "../../graph/index.ts";

/**
 * - `start`, `merge`, `noop`: structure a person never sees;
 * - `end`: hidden, or "Give back ..." when the Flow has outputs;
 * - `branch`, `switch`, `loop`: control that nests other steps;
 * - `handler`, `handler-end`: a registration run when something goes wrong, and where its body ends;
 * - `call`: runs another Flow;
 * - `data`: Core's data nodes and a pipeline's steps;
 * - `act`: a recorded step or a domain's own node, which acts on a site;
 * - `other`: any other Core node (logic, timing, a check).
 */
export type OutlineNodeRole = "start" | "end" | "merge" | "noop" | "branch" | "switch" | "loop" | "handler" | "handler-end" | "call" | "data" | "act" | "other";

const ROLE_OF: ReadonlyMap<string, OutlineNodeRole> = new Map<string, OutlineNodeRole>([
  ["builtin.control.start", "start"],
  ["builtin.control.end", "end"],
  ["builtin.control.merge", "merge"],
  ["builtin.control.noop", "noop"],
  ["builtin.control.branch", "branch"],
  ["builtin.control.switch", "switch"],
  ["builtin.control.for-each", "loop"],
  ["builtin.control.loop", "loop"],
  ["builtin.control.repeat", "loop"],
  [AUTOMATION_STUDIO_HANDLER_DEFINITION_ID, "handler"],
  [AUTOMATION_STUDIO_HANDLER_END_DEFINITION_ID, "handler-end"],
  [AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID, "call"],
  [PIPELINE_NODE_TYPES.callFlow, "call"],
  ["builtin.flow.call", "call"],
  ["builtin.policy.action", "act"]
]);

/** The node's role in the outline. */
export function outlineNodeRole(node: AutomationStudioFlowNode): OutlineNodeRole {
  const known = ROLE_OF.get(node.definitionId);
  if (known) return known;
  if (getCallFlowConfiguration(node)) return "call";
  if (node.definitionId.startsWith("builtin.data.")) return "data";
  return node.definitionId.startsWith("builtin.") ? "other" : "act";
}
