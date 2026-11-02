import type { AutomationStudioResolvedActionEffect } from "../../../../components/automation/action-effect/index.ts";

export type AutomationStudioActionAssessmentSettled = Readonly<{
  effect: AutomationStudioResolvedActionEffect;
  permitted: boolean;
}>;
