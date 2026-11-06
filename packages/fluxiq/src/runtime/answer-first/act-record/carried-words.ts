// How an act an earlier attempt made is said (`./seed.ts`): as already done, and not as something
// this attempt changed on the site. The words go on the act a person and a judge read, never on what
// is persisted, so a later seed does not say it twice. Left as it was where the contract refuses the
// line with them, so an act is never worse for it.

import { parseAutomationStudioAttemptAct, type AutomationStudioAttemptActState } from "@fluxiq/contracts/automation";

const DONE = "Already done earlier";
const MAYBE = "May already be done";

export function automationStudioAttemptActCarriedWords(what: string, state: AutomationStudioAttemptActState): string {
  const said = `${state === "landed" ? DONE : MAYBE}: ${what}`;
  return parseAutomationStudioAttemptAct({ id: "act.words", what: said, where: "On the site", classes: [], state }).ok ? said : what;
}
