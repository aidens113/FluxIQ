import type { AutomationStudioActionAssessmentScope } from "../../../flows/executable/permissions/index.ts";
import { actionAssessmentFrames } from "./store.ts";

/** Core-private transport; scopes never replace or hide an active ancestor. */
export function runWithAutomationStudioActionAssessments<T>(scope: AutomationStudioActionAssessmentScope, run: () => T): T {
  return actionAssessmentFrames.run(Object.freeze({ scope, parent: actionAssessmentFrames.getStore() }), run);
}
