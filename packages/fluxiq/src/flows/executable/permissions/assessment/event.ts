import type { AutomationStudioActionAssessmentSource } from "./source.ts";
import type { AutomationStudioActionAssessmentSettled } from "./settled.ts";

export type AutomationStudioActionAssessmentEvent =
  | Readonly<{ kind: "started"; identity: object; source?: AutomationStudioActionAssessmentSource }>
  | Readonly<{ kind: "settled"; identity: object; value: AutomationStudioActionAssessmentSettled }>;
