import type { AutomationStudioLlmDiagnosisFields } from "../../llm/index.ts";
import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultReadWorkingSets } from "../read-account/index.ts";
import { automationStudioResultYesSaysUnjudged } from "./unjudged-words.ts";

/** Where a yes over no rows sends the attempt: to where the site now shows what was asked, and how an honest empty answer is said. */
const FIND_THEM = "Where the request asks for records, find where the site now shows them and read them into the result; a yes over no rows says the site shows none (answerRecords asked true, siteShows 0).";

/**
 * Core's sentences for a yes that does not stand on the rows the result holds
 * (`./index.ts`, t875); none where it does. Asked of a judge only where its
 * caller says a yes must stand on rows (`../verdict/types.ts`, `yesOnRows`).
 *
 * - The result holds rows and the yes cites none of them (`diagnosis.checked`).
 * - The result holds no rows and the yes cites some: they are no rows of the result.
 * - The yes does not say whether the request asks for records
 *   (`diagnosis.answerRecords`): a records yes is only told from another by
 *   that field, so its absence is never taken as "no list asked", over rows or
 *   over none (lane C, `run-mw4bxkn9-004e2667`: a yes over no rows).
 * - The yes says records are asked but not how many the site shows.
 * - The count it says the site shows as the answer is not the rows held: the
 *   rows are not the list the request names.
 * - Its own words say what was asked could not be judged (`./unjudged-words.ts`).
 *
 * An honest empty result is a yes with `asked` true, `siteShows` 0, no
 * citation and no rows held, and passes. Over no rows each sentence leads to
 * where the site now shows the records asked for.
 */
export function automationStudioResultRecordsYesRefuted(
  summary: Pick<AutomationStudioRunResultSummary, "reads" | "recordSets">,
  diagnosis: Pick<AutomationStudioLlmDiagnosisFields, "checked" | "answerRecords" | "observed" | "changed"> | undefined,
  summaryText?: string
): string[] {
  const held = automationStudioResultHeldRowCount(summary);
  const records = diagnosis?.answerRecords;
  const cited = diagnosis?.checked?.length ?? 0;
  const said: string[] = [];
  if (held > 0 && !cited) said.push(`The yes cites no stored row, though the result holds ${rows(held)}: a yes on rows cites in checked each stored row that answers the request.`);
  if (held === 0 && cited) said.push(`The yes cites ${rows(cited)}, but the result holds none. ${FIND_THEM}`);
  if (records === undefined) said.push(held > 0 ? `The yes does not say in answerRecords whether the request asks for records, nor how many the site shows as its answer, though the result holds ${rows(held)}.` : `The result holds no rows, and the yes does not say in answerRecords whether the request asks for records. ${FIND_THEM}`);
  if (records?.asked && records.siteShows === undefined) said.push(`The yes says the request asks for records but not how many the site shows as its answer, so they cannot be compared with the ${rows(held)} the result holds.${held === 0 ? ` ${FIND_THEM}` : ""}`);
  if (records?.asked && records.siteShows !== undefined && records.siteShows !== held) {
    said.push(`The judgement counts ${records.siteShows} ${records.siteShows === 1 ? "record" : "records"} the site shows as the answer, but the result holds ${rows(held)}. The answer is the list the request names, as the site shows it: read that list itself and hold exactly the records of it the request asks for.`);
  }
  if (automationStudioResultYesSaysUnjudged({ observed: diagnosis?.observed, changed: diagnosis?.changed, summaryText })) {
    said.push("The yes says in its own words that what was asked could not be judged from what is here, and a yes stands only on what is here. Find where the site now shows what the request asks for and read it into the result; a judge that cannot tell answers unknown.");
  }
  return said;
}

/** How many rows the result's answer holds: every answer set's record count, never a working set's (`../read-account/working-sets.ts`). */
export function automationStudioResultHeldRowCount(summary: Pick<AutomationStudioRunResultSummary, "reads" | "recordSets">): number {
  const working = automationStudioResultReadWorkingSets(summary);
  return summary.recordSets.filter((set) => !working.has(set.datasetId)).reduce((sum, set) => sum + (Number.isSafeInteger(set.recordCount) && set.recordCount > 0 ? set.recordCount : 0), 0);
}

function rows(count: number): string {
  return `${count} ${count === 1 ? "row" : "rows"}`;
}
