import { checkAutomationStudioFlowBootstrapCompletion } from "../../llm/harness-options/index.ts";
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";
import { automationStudioInterfaceOutputPort } from "./interface-output-port.ts";

/**
 * A part's output bound to a port its step's node does not declare (t639),
 * or to its success or failure port, a route that hands on no value (t594's
 * rule, which only a subflow brief met): the value would be empty when the
 * Flow runs, and a step that reads it would read nothing. Refused naming the ports the node does declare
 * (`./interface-output-port.ts`). A whole candidate's parts are its own, so the
 * way out is to drop the output rather than to end a brief.
 */
export function partOutputPortIssues(
  plan: AutomationStudioFlowBootstrapPlan,
  nodes: Pick<Parameters<typeof checkAutomationStudioFlowBootstrapCompletion>[0], "registry" | "resolution">
): AutomationStudioFlowBootstrapIssue[] {
  return plan.subflows.flatMap((subflow, index) => (subflow.interface?.outputs ?? []).flatMap((output): AutomationStudioFlowBootstrapIssue[] => {
    const read = automationStudioInterfaceOutputPort(subflow, output.metadata?.binding, nodes);
    const way = "If no step of the part makes that value, drop the output, and have the step that needs the value read it where it is made.";
    if (read?.kind === "route") {
      return [{ severity: "error", code: "candidate.part_output_not_a_value", path: `plan.subflows.${index}`, message: `The output "${output.id}" of the part "${subflow.key}" is bound to the ${read.role} port "${read.port}" of one of its steps. That port says only whether the step ${read.role === "success" ? "worked" : "failed"}, and hands on no value. `
        + "Bind the output to a value one of the part's own steps reads or makes: `output: <name> = $step.<label>.<output>`, naming an output that holds that value. " + way }];
    }
    if (read?.kind !== "unknown") return [];
    return [{ severity: "error", code: "candidate.part_output_unknown_port", path: `plan.subflows.${index}`, message: `The output "${output.id}" of the part "${subflow.key}" is bound to "${read.port}" of one of its steps, and that step's node "${read.definitionId}" declares no output by that name: it declares only ${read.declared.join(", ") || "no output"}. That binding would hand on nothing when the Flow runs. `
      + "Bind the output to an output the step's node declares and that holds the value: `output: <name> = $step.<label>.<output>`. " + way }];
  }));
}
