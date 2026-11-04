// An attempt's acts as a result carries them. **Every lasting act stays** (D6): a
// result's empty list says nothing changed on the site, so an act whose words the
// contract refuses keeps its place in plainer words instead of being dropped, and an
// act whose state cannot be read is said as may have landed, never as not done.

import { AUTOMATION_STUDIO_TASK_ATTEMPT_LIMITS as LIMITS, parseAutomationStudioAttemptAct, type AutomationStudioAttemptAct } from "@fluxiq/contracts/automation";

export function automationStudioAnswerFirstCarriedActs(acts: readonly AutomationStudioAttemptAct[]): { acts: AutomationStudioAttemptAct[]; notes: string[] } {
  const given = Array.isArray(acts) ? acts : [];
  const kept = given.slice(0, LIMITS.listMaxEntries).map((act, index) => carried(act, index));
  const past = given.length - kept.length;
  return { acts: kept, notes: past > 0 ? [`${past} more lasting acts are not listed here.`] : [] };
}

function carried(act: AutomationStudioAttemptAct, index: number): AutomationStudioAttemptAct {
  const whole = parseAutomationStudioAttemptAct(act);
  if (whole.ok) return whole.act;
  let safe: AutomationStudioAttemptAct = { id: `act.unreadable.${index + 1}`, what: "A change on the site, in words that could not be kept", where: "On the site", classes: [], state: "may_have_landed" };
  // Each field of the given act that the contract takes, on its own.
  const fields = typeof act === "object" && act !== null ? Object.entries(act) : [];
  for (const [key, value] of fields) {
    const tried = parseAutomationStudioAttemptAct({ ...safe, [key]: value });
    if (tried.ok) safe = tried.act;
  }
  return safe;
}
