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
//
// An output bound to a port the step's node does not declare at all is refused
// `subflow.output_unknown_port` (t639), naming the ports it does declare, with
// the same way out: on A8 wave 10 a builder handed on such a port, Core
// accepted it, the value was empty at run time, and every later builder was
// held to read it. How a binding is read is `../candidate/interface-output-port.ts`.
import type { AutomationStudioNodeRegistry } from "../../../nodes/index.ts";
import { automationStudioInterfaceOutputPort } from "../candidate/index.ts";
import type { AutomationStudioFlowBootstrapSubflow } from "../plan/index.ts";
import type { AutomationStudioSubflowScopeIssue } from "./scope-issue.ts";

/** t581's way out, said when the subflow has no value to hand on (header). */
const WAY_OUT = "If this subflow has no value to hand on, the plan asks it for one it does not make: end the brief blocked and name the output, so the plan can change.";

/** The issues of a callable target whose outputs are bound to a step's success or failure port, or to a port its node does not declare (header). */
export function automationStudioSubflowRouteOutputs(
  target: AutomationStudioFlowBootstrapSubflow,
  nodes: { registry: Pick<AutomationStudioNodeRegistry, "get">; resolution?: Parameters<AutomationStudioNodeRegistry["get"]>[1] }
): AutomationStudioSubflowScopeIssue[] {
  const issues: AutomationStudioSubflowScopeIssue[] = [];
  for (const output of target.interface?.outputs ?? []) {
    const read = automationStudioInterfaceOutputPort(target, output.metadata?.binding, nodes);
    if (read?.kind === "route") {
      issues.push({ code: "subflow.output_not_a_value", path: `flow.output.${output.id}`, message: `The output "${output.id}" is bound to the ${read.role} port "${read.port}" of one of this part's steps. That port says only whether the step ${read.role === "success" ? "worked" : "failed"}, and hands on no value. `
        + "Bind each output to a value one of the part's own steps reads or makes: `output: <name> = $step.<label>.<output>`, naming an output that holds that value. " + WAY_OUT });
    } else if (read?.kind === "unknown") {
      issues.push({ code: "subflow.output_unknown_port", path: `flow.output.${output.id}`, message: `The output "${output.id}" is bound to "${read.port}" of one of this part's steps, and its node "${read.definitionId}" declares no output by that name: it declares only ${read.declared.join(", ") || "no output"}. That binding would hand on nothing when the Flow runs. `
        + "Bind each output to an output the step's node declares and that holds the value: `output: <name> = $step.<label>.<output>`. " + WAY_OUT });
    }
  }
  return issues;
}
