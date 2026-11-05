// Lasting classes in a person's words, for a refusal. The same phrases a permission
// question uses, so a person reads one vocabulary.
import type { AutomationStudioAttemptActClass } from "@fluxiq/contracts/automation";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES } from "../../action-permission-requests/index.ts";

/** "spend, refund or move money and delete or remove something". */
export function automationStudioPartClassWords(classes: readonly AutomationStudioAttemptActClass[]): string {
  const phrases = classes.map((each) => AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES[each]);
  if (phrases.length < 2) return phrases.join("");
  return `${phrases.slice(0, -1).join(", ")} and ${phrases.at(-1)!}`;
}
