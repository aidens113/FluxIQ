// The line a run says when it met a dangerous act nobody foresaw when the task started (t976).
//
// The user's rule: a dangerous act is asked about only when a Flow or chat starts, never in the
// middle (`./action-permissions.ts`, header). So an act the instruction's read did not show is
// refused unasked, and the person is told so once, in plain words, with when they will be asked.

import { AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES, type AutomationStudioActionConsequence } from "../../action-permission-requests/index.ts";

/** The line said when a run met a gated class nobody foresaw at its start. */
export function automationStudioFlowBootstrapUnforeseenSaid(classes: readonly AutomationStudioActionConsequence[]): string {
  const said = classes.map((consequence) => AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES[consequence]);
  const list = said.length <= 1 ? said.join("") : `${said.slice(0, -1).join(", ")} and ${said.at(-1)}`;
  return `This task needed to ${list}, which your instruction did not show when it started, so you were not asked and it was not done. You will be asked when the task starts again.`;
}
