// The check on a result, said as it is. A tick only for a confirmed result with every act
// settled; an unconfirmed one has no mark and says why and asks the person to look; a refuted
// one is a failed mark and its words. Never a guess in the result's favour.

import type { ChatTaskResult } from "../../ports/index.ts";
import type { AnswerCheck } from "./answer-types.ts";
import { effectiveLabel, hasUnsettledAct } from "./effective-label.ts";

/** The check of `result`. */
export function checkWords(result: ChatTaskResult): AnswerCheck {
  const label = effectiveLabel(result);
  if (label === "confirmed") return { state: "confirmed", mark: "tick", words: "Checked" };
  if (label === "refuted") return { state: "refuted", mark: "cross", words: "Did not pass the check" };
  if (hasUnsettledAct(result) && result.label === "confirmed") return { state: "unverified", mark: "none", words: "Not confirmed. Something may have happened on the site that I could not settle, so please look to be sure." };
  const why = result.timesChecked > 0 ? "I could not confirm this" : "I did not get to check this";
  return { state: "unverified", mark: "none", words: `Not confirmed. ${why}, so please look to be sure.` };
}
