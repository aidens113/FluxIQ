import type { AutomationStudioActionAssessmentEvent } from "./event.ts";
import type { AutomationStudioActionAssessmentPreflight } from "./preflight.ts";

/** Private deny-only observer. False/absence leaves ordinary permission in charge. */
export type AutomationStudioActionAssessmentScope = Readonly<{
  observe(event: AutomationStudioActionAssessmentEvent): void;
  veto?(input: AutomationStudioActionAssessmentPreflight): boolean;
}>;
