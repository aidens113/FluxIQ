// Whether any call in a lasting step's own tab can still give Core a place that shows its change (t791 fix 2). A ref
// is read in one tab and names a place only for a press in that same tab (`resetResource` is per tab), so only refs of
// the step's own resource count, and only a tab Core can read in can issue one. Pure.
//
// - `no_call`: the step's control names no tab, or names no item, page or list at all, so nothing read in any tab can
//   be tied to it; or the build can issue no new ref (an act with an unknown effect place sealed it) and the step's tab
//   holds none already issued. The trial is then judged by its end view and done-when check only.
// - `another_page`: a complete read in that tab can still make one -- the page where a creation shows, a list for any
//   other reversible act -- which is a call somewhere other than on the control itself.

import type { AutomationStudioSiteResetCanMeet } from "../reset-answers/index.ts";
import type { AutomationStudioSiteResetIssuedRef } from "../reset-settlement/index.ts";

/** What the answer reads: the step's control, the build's refs issued in its tab, and whether the build can still issue one. */
export type AutomationStudioSiteResetStepReachInput = {
  /** The tab the control sits in; absent when unknown. */
  resource: string | undefined;
  /** Whether the control names an item, a page or a list. */
  identified: boolean;
  /** Refs the model was shown that were read in the control's own tab (`issuedRefsIn`). */
  issuedHere: readonly AutomationStudioSiteResetIssuedRef[];
  /** Whether no further read can become an original (`create-baselines.ts`, `seal`). */
  sealed: boolean;
};

/** Whether a call in the step's tab can make a witness for it (header). */
export function automationStudioSiteResetStepReach(input: AutomationStudioSiteResetStepReachInput): AutomationStudioSiteResetCanMeet {
  if (input.resource === undefined || !input.identified) return "no_call";
  if (input.sealed && input.issuedHere.length === 0) return "no_call";
  return "another_page";
}
