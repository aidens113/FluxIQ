import type { AutomationStudioAsk } from "../../parking/index.ts";
import { automationStudioActivityAskIsPersonNeeded } from "./person-needed.ts";

/**
 * The title of an ask's card, the same on the row that opens the wait and the
 * row that settles it, so a client reading either one reads the same card. A
 * person-needed ask names the check, which is how a client tells a robot check
 * from a permission.
 */
export function automationStudioActivityAskTitle(ask: Pick<AutomationStudioAsk, "kind" | "control">): string {
  return automationStudioActivityAskIsPersonNeeded(ask) ? "Asked the person to complete a check" : `Asked a question (${ask.kind})`;
}
