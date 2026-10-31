// A no the build's own record contradicts, as the subflow trial gate keeps it
// (`./subflow-trial-gate.ts`, header, t633 and t634): an unsure with Core's words
// beside the judge's, so its revision is not closed. Moved out of the gate as
// it stood, unchanged, when the gate reached its file budget (t804).
import type { AutomationStudioResultStandingNoContradiction } from "../../result-verification/standing-no/index.ts";
import type { AutomationStudioSubflowTrialResult } from "./contracts.ts";

/** A no the build's own record contradicts, kept as an unsure with Core's words beside the judge's (header, t633): its revision is not closed. */
export function automationStudioSubflowContradictedNo(answer: AutomationStudioSubflowTrialResult, contradiction: AutomationStudioResultStandingNoContradiction): AutomationStudioSubflowTrialResult {
  const said = contradiction.revision < 1 ? earlierBriefSaid(contradiction) : contradiction.said;
  return { ...answer, verdict: "unsure", feedback: { ...answer.feedback, contradictedByBuild: said } };
}

/**
 * Core's words for a no an earlier brief's standing no contradicts (header,
 * t634): as `../../result-verification/standing-no/contradiction.ts` says it,
 * but naming the revision as an earlier brief's, since its number is not one
 * of this brief's. The conditions by Core's names and a count of rows, never
 * their labels. Generic words.
 */
function earlierBriefSaid(found: AutomationStudioResultStandingNoContradiction): string {
  const { conditions, rows } = found;
  const them = conditions.length === 1 ? conditions[0]! : `${conditions.slice(0, -1).join(", ")} and ${conditions.at(-1)!}`;
  const what = rows === 1 ? "a row" : `${rows} rows`;
  const it = rows === 1 ? "it" : "them";
  return `Core's record of this build contradicts this no. A revision of this subflow that an earlier brief tested, read without ${them}, stored ${what} that the no standing on its trial called not the kind of thing the request asks for; `
    + `this revision reads with ${conditions.length === 1 ? "it" : "them"} and stores none of ${it}. Removing ${them}, as this no asks, would bring back exactly what answered that earlier no, `
    + "so this no is not taken: the verdict is unsure, not no.";
}
