// A callable subflow's outputs that hand on a route, not a value (t594).
//
// On A8 launch 7 (crossborder) a first builder bound its interface output to a
// click's success port (`output: <name> = $step.<label>.success`): a routing
// signal, which says only that the step worked. Core accepted it, since an
// output was only asked to be bound, and the next subflow navigated to it as an
// address. An output bound to a port whose role is success or failure is now
// refused `subflow.output_not_a_value` (`./scoped-submission.ts`), with t581's
// way out (`./callable-target.ts`, `subflow.input_unread`): if the subflow has
// no value to hand on, end the brief blocked and name the output, so the plan
// can change. The port's role is the node definition's; a port the registry
// does not describe is read by its id, as definitions default it
// (`nodes/shared/definition.ts`).
import type { AutomationStudioNodeRegistry } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapSubflow } from "../plan/index.ts";
import type { AutomationStudioSubflowScopeIssue } from "./scope-issue.ts";

/** A port's role by its id, for a port the registry does not describe (header). */
const ROUTE_PORTS: Readonly<Record<string, "success" | "failure">> = { success: "success", failed: "failure", failure: "failure" };

/** Where a bound output reads from: `$node.<key>.<port>`, the plan's form of `$step.<label>.<output>`. */
const NODE_OUTPUT = /^\$node\.([^.]+)\.([^.]+)/u;

/** The issues of a callable target whose outputs are bound to a step's success or failure port (header). */
export function automationStudioSubflowRouteOutputs(
  target: AutomationStudioFlowBootstrapSubflow,
  nodes: { registry: Pick<AutomationStudioNodeRegistry, "get">; resolution?: Parameters<AutomationStudioNodeRegistry["get"]>[1] }
): AutomationStudioSubflowScopeIssue[] {
  const issues: AutomationStudioSubflowScopeIssue[] = [];
  for (const output of target.interface?.outputs ?? []) {
    const state = output.metadata?.binding.$state;
    const path = state && typeof state === "object" && !Array.isArray(state) ? state.path : undefined;
    const read = typeof path === "string" ? NODE_OUTPUT.exec(path) : null;
    const nodeKey = read?.[1];
    const port = read?.[2];
    const node = nodeKey === undefined ? undefined : target.nodes.find((candidate) => candidate.key === nodeKey);
    if (!node || port === undefined) continue;
    const role = nodes.registry.get(node.definitionId, nodes.resolution)?.outputs.find((candidate) => candidate.id === port)?.role ?? ROUTE_PORTS[port];
    if (role !== "success" && role !== "failure") continue;
    issues.push({ code: "subflow.output_not_a_value", path: `flow.output.${output.id}`, message: `The output "${output.id}" is bound to the ${role} port "${port}" of one of this part's steps. That port says only whether the step ${role === "success" ? "worked" : "failed"}, and hands on no value. `
      + "Bind each output to a value one of the part's own steps reads or makes: `output: <name> = $step.<label>.<output>`, naming an output that holds that value. "
      + "If this subflow has no value to hand on, the plan asks it for one it does not make: end the brief blocked and name the output, so the plan can change." });
  }
  return issues;
}
