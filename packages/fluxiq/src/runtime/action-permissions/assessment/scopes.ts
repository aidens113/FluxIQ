import type { AutomationStudioActionAssessmentScope } from "../../../flows/executable/permissions/index.ts";
import { actionAssessmentFrames } from "./store.ts";

export function automationStudioActionAssessmentScopes(): readonly AutomationStudioActionAssessmentScope[] {
  const scopes: AutomationStudioActionAssessmentScope[] = [];
  for (let frame = actionAssessmentFrames.getStore(); frame; frame = frame.parent) scopes.push(frame.scope);
  return scopes;
}
