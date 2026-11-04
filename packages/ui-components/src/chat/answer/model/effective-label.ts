// The label a result is told with. A tick needs every act settled: a result whose check said
// yes but whose act record holds one that may have landed is told as not confirmed, because
// the person has to look to know what happened on the site.

import type { ChatTaskResult } from "../../ports/index.ts";

/** Whether the act record holds an act that may or may not have happened. */
export function hasUnsettledAct(result: ChatTaskResult): boolean {
  return result.acts.some((act) => act.state === "may_have_landed");
}

/** `result.label`, never `confirmed` beside an unsettled act. */
export function effectiveLabel(result: ChatTaskResult): ChatTaskResult["label"] {
  return result.label === "confirmed" && hasUnsettledAct(result) ? "unverified" : result.label;
}
