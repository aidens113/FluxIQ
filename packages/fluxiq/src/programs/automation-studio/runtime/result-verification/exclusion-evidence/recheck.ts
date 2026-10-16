// The recheck a yes is asked again with when it lacked the exclusion evidence
// `../request-rows/unquoted-rows.ts` holds it to (t515).
//
// **Only the rows still to argue (t574).** Live run `run-mv7vor5f-ea4d08b4`'s
// recheck listed all 37 rows six conditions left out, most of them rows a
// rating or price bound left out with values that settle them, and it turned
// the one correct yes into a no. The lines below it are Core's
// (`../verdict/`): rows left out by a text or presence condition, each to be
// named beside a quote of the request, and, for a numeric bound whose rows Core
// read as failing it (`../value-readings/settled-rows.ts`), the one quote of
// the request stating the bound. Each condition is named `condition N
// (wording)`, as the summary's own `reads[].conditions[].number` says it.
// A row may be named by the id the summary shows before it (`[row K4R7M2]`,
// `../request-rows/row-id.ts`, t599), and a presence test's rows are settled
// like a bound's: one quote of the request asking for that value. And a line
// may name rows the result keeps that Core measured as unlike the rest (t663,
// `../verdict/`): the last sentence says what is asked of those.

import type { AutomationStudioResultVerification } from "../contracts/index.ts";
import { screenAutomationStudioLlmEvidence } from "../../llm/index.ts";

/** What the recheck asks, said once above Core's lines (header). Written for no site or kind of item. */
const RECHECK = "Your affirmative judgement lacked required exclusion evidence. Recheck the same request and result; do not change the Flow or invent an exclusion. "
  + "For every row named below, use its full displayed name or exact distinguishing identifier, or the id the summary shows in brackets before it (as in [row K4R7M2]), in a sentence that also quotes in double quotes the request's own words excluding that row. "
  + "Where a line says Core already read a condition's left-out rows as failing its bound, those rows need no quote of their own: quote once, in a sentence that names that condition as the line does, the request's own words stating that bound. "
  + "Search or navigation words alone exclude nothing. If the request does not justify the exclusion, answer no; if evidence is insufficient, answer unknown. "
  + "Where a line names rows the result keeps rather than rows left out, there is no exclusion to show: name each such row in a sentence that quotes in double quotes the request's own words for what it asks for, and say whether the row is that; if the request does not ask for a row the result keeps, answer no.";

/** Correct only a deficient explanation, using the same screened evidence and existing ask allowance. */
export function automationStudioResultExclusionEvidenceRecheck(verification: AutomationStudioResultVerification, deniedKeys: readonly string[] | undefined): string | undefined {
  if (!verification.exclusionEvidenceMissing?.length || deniedKeys === undefined) return undefined;
  const recheck = [RECHECK, ...verification.exclusionEvidenceMissing].join("\n");
  const screened = screenAutomationStudioLlmEvidence({ recheck }, deniedKeys);
  return screened.deniedKey || screened.secretShaped ? undefined : recheck;
}
