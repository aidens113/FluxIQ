// Whether a run's inputs fit its FluxNode: they pass the declared input type, and
// every input the goal names is there (plan, N2-N3).

import type { JsonObject } from "../../core.ts";
import type { FluxNodeIssue } from "../issue/index.ts";
import type { FluxNodeSpec } from "../spec/index.ts";
import { readFluxNodeGoal } from "../spec/index.ts";
import { validateJsonValue } from "../type-schema/index.ts";

/**
 * Every reason `inputs` do not fit `spec`, as issues under `/inputs`; none says they
 * fit. With no declared input type, any object fits, though the goal's placeholders
 * still need their inputs.
 */
export function checkFluxNodeRunInputs(spec: FluxNodeSpec, inputs: JsonObject): FluxNodeIssue[] {
  const issues: FluxNodeIssue[] = [];
  if (spec.inputs !== undefined) {
    for (const error of validateJsonValue(spec.inputs, inputs)) issues.push({ path: `/inputs${error.path}`, code: `inputs.${error.code}`, message: error.message });
  }
  const reading = readFluxNodeGoal(spec.goal);
  if (reading.ok) {
    for (const name of reading.inputs) {
      if (Object.hasOwn(inputs, name)) continue;
      const path = `/inputs/${name.replaceAll("~", "~0").replaceAll("/", "~1")}`;
      if (issues.some((issue) => issue.path === path && issue.code === "inputs.required")) continue;
      issues.push({ path, code: "inputs.goal_input_missing", message: `The goal uses {${name}}, so the "${name}" input is needed.` });
    }
  }
  return issues;
}
