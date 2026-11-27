// A step's parameters as its identity: a copy without every parameter Core writes for how the step runs
// (`./step-run-parameters.ts`, t1075). Each reader that tells one step from another by its parameters (a learned pace,
// an explored toggle, a trial press tied to a step) reads through this, so a step that carries a run parameter its
// trial or press never had (`requiresChosen`, written at assembly) is still the same step. Before, each stripped only
// `ensureState`, a subset of its own; `./tests/one-list.test.ts` fails if any reader strips one again.

import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioIsStepRunParameter } from "./is-run-parameter.ts";

/** A copy of `parameters` with every run parameter taken off; `{}` for none. */
export function automationStudioStepWithoutRunParameters(parameters: JsonObject | undefined): JsonObject {
  return Object.fromEntries(Object.entries(parameters ?? {}).filter(([key]) => !automationStudioIsStepRunParameter(key))) as JsonObject;
}
