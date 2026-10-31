import type { AutomationStudioLlmVerificationChecked } from "../../llm/index.ts";
import type { AutomationStudioResultVerification, AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultCitationRefuted } from "./citation-refuted.ts";
import { automationStudioResultCitedStoredCells } from "./stored-cells.ts";

/**
 * What a yes cited it checked, and which citations Core's record of the result
 * does not bear out (`./index.ts`, t810). Nothing where the yes cited none, so
 * a yes with no `checked` stays as it was. A cited row Core does not find is
 * refuted only where Core holds every row of the answer: given a sample, it
 * may be a row Core was not shown; a cited row Core finds is checked in its
 * column and value either way. A build test's answer holds no cell Core was
 * shown, so none of its citations is refuted.
 */
export function automationStudioResultYesCitations(
  summary: Pick<AutomationStudioRunResultSummary, "reads" | "recordSets">,
  checked: readonly AutomationStudioLlmVerificationChecked[] | undefined
): NonNullable<AutomationStudioResultVerification["yesCitations"]> | undefined {
  if (!checked?.length) return undefined;
  const { rows, complete } = automationStudioResultCitedStoredCells(summary);
  const refuted: string[] = [];
  for (const cited of checked) {
    const sentence = automationStudioResultCitationRefuted(cited, rows);
    if (sentence === undefined) continue;
    // A row beyond the rows Core was shown is unfound, not refuted.
    if (!complete && sentence.includes("is no row the result holds")) continue;
    refuted.push(sentence);
  }
  return { cited: checked.length, refuted };
}
