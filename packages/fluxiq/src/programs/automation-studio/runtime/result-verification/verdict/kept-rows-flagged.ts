import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultKeptNotNamingTheItem, automationStudioResultKeptWithoutAskedColumn, type AutomationStudioRequestRowsKept, type AutomationStudioRequestWording } from "../request-rows/index.ts";

/**
 * Every row the result keeps that Core flagged as unlike the rest (header,
 * t663): alone without an answer column's value, or alone not writing the
 * request's item phrase. What a yes is held to here, and what a refuted no's
 * re-ask names (`../agreement/`, `../refuted-no/reask.ts`). None without
 * the summary and the request.
 */
export function automationStudioResultKeptRowsFlagged(summary: AutomationStudioRunResultSummary | undefined, wording: AutomationStudioRequestWording | undefined): AutomationStudioRequestRowsKept[] {
  if (!summary || !wording) return [];
  return [...automationStudioResultKeptWithoutAskedColumn(summary), ...automationStudioResultKeptNotNamingTheItem(summary, wording.phrases)];
}
