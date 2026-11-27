// Whether a step's parameter is one Core writes for how the step runs (`./step-run-parameters.ts`, t1075): the one test
// every reader of a step's identity asks, so none keeps a subset of its own.

import { AUTOMATION_STUDIO_STEP_RUN_PARAMETERS } from "./step-run-parameters.ts";

const NAMES: ReadonlySet<string> = new Set(Object.values(AUTOMATION_STUDIO_STEP_RUN_PARAMETERS));

/** Whether `key` names one of Core's run parameters, never part of which step or act it is. */
export function automationStudioIsStepRunParameter(key: string): boolean {
  return NAMES.has(key);
}
