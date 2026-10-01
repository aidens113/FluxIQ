import { AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND, type AutomationStudioAsk } from "../../parking/index.ts";

/** Whether an ask is Core's person-needed one (a robot check), read from its marker rather than its words. */
export function automationStudioActivityAskIsPersonNeeded(ask: Pick<AutomationStudioAsk, "control">): boolean {
  return ask.control?.kind === AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND;
}
