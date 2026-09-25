// What the Flow a build wrote can do with a set of records, read off the plan.
//
// Two ways a step produces one, and both count, because both are capability
// rather than technique:
//
//   - its definition declares where its own result keeps rows
//     (`metadata.recordsPath`, or Core's own node that writes the rows it is
//     given). The web domain's list extraction declares one and saves its rows
//     with no record output written at all -- "the rows are saved without a
//     recordOutput" is the parameter's own description -- so requiring a
//     written one here would refuse the very node that answers the request;
//   - the step writes a record output, naming the dataset its rows are saved
//     into. That is the only way a node without a declared path can save any,
//     and `null` is how such a node is told to save nothing
//     (`../plan/record-output-contract.ts`).
//
// Nothing here reads a row, a column or a value. It reads which nodes the plan
// names and what their definitions declare, which is the same information
// `../plan/validation.ts` already holds a record output to its contract with.
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import { automationStudioFlowBootstrapSuppliedRecordsPath, type AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";
import type { AutomationStudioFlowBootstrapPlanRecordSets } from "./contracts.ts";

export function automationStudioFlowBootstrapPlanRecordSets(input: {
  plan: AutomationStudioFlowBootstrapPlan;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
}): AutomationStudioFlowBootstrapPlanRecordSets {
  const returning: string[] = [];
  const storing: string[] = [];
  const steps: string[] = [];
  for (const subflow of input.plan.subflows) {
    for (const node of subflow.nodes) {
      steps.push(node.definitionId);
      // A definition the resolution does not offer refuses the plan in
      // validation under its own code; it is not this check's to answer.
      const definition = input.registry.get(node.definitionId, input.resolution);
      if (!definition) continue;
      if (automationStudioFlowBootstrapSuppliedRecordsPath(definition) !== undefined) returning.push(node.key);
      const parameter = definition.parameters.find((candidate) => candidate.ui?.control === "record-output");
      if (parameter && savesARecordSet(node.parameters?.[parameter.id])) storing.push(node.key);
    }
  }
  return { returning, storing, steps };
}

/** A record output that names a dataset: an object, never absent and never null. */
function savesARecordSet(value: JsonValue | undefined): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
