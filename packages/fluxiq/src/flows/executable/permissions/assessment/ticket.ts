import type { AutomationStudioResolvedActionEffect } from "../../../../components/automation/action-effect/index.ts";
import type { AutomationStudioActionAssessmentSettled } from "./settled.ts";

export type AutomationStudioActionAssessmentTicket = Readonly<{
  veto(effect: AutomationStudioResolvedActionEffect): boolean;
  settle(value: AutomationStudioActionAssessmentSettled): void;
}>;
