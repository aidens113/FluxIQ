import type { AutomationStudioActionAssessmentSource } from "./source.ts";
import type { AutomationStudioResolvedActionEffect } from "../../../../components/automation/action-effect/index.ts";

export type AutomationStudioActionAssessmentPreflight = Readonly<{
  identity: object;
  source?: AutomationStudioActionAssessmentSource;
  effect: AutomationStudioResolvedActionEffect;
}>;
