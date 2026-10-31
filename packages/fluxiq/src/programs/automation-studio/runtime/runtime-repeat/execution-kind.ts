import type { AutomationNodeDefinition } from "../../nodes/index.ts";
import { controlFlowNodes } from "../../nodes/control-flow/index.ts";
import { dataNodes } from "../../nodes/data/index.ts";
import { logicNodes } from "../../nodes/logic/index.ts";
import { mathNodes } from "../../nodes/math/index.ts";
import { policyNodes } from "../../nodes/policy/index.ts";

const controls = new Set(["builtin.control.start", "builtin.control.end", "builtin.control.merge", "builtin.control.branch", "builtin.control.switch", "builtin.control.loop", "builtin.control.for-each", "builtin.control.repeat"]);
const transparent = new Map([...controlFlowNodes.filter(node => controls.has(node.id)), ...dataNodes.filter(node => node.id !== "builtin.data.write-records"), ...logicNodes, ...mathNodes].map(node => [node, node.execute]));
const action = policyNodes.find(node => node.id === "builtin.policy.action")!;
const actionExecute = action.execute;

/** Only the definition that is actually executed can establish Core transparency. */
export function automationStudioRuntimeRepeatExecutionKind(definition: AutomationNodeDefinition | undefined): "transparent" | "observed" | "barrier" {
  if (!definition) return "observed";
  if (transparent.has(definition) && transparent.get(definition) === definition.execute) return "transparent";
  if (definition === action && definition.execute === actionExecute) return "observed";
  return "barrier";
}
