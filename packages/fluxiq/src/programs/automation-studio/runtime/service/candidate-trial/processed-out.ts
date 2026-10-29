// The rows a trial's saved answer left out by one processing condition alone,
// for the model (t493).
//
// Live run `run-mv6bg8d8-1a461436` (C round 14): the Flow's
// `recordOutput.process.where` left out rows the request asked for, items sold
// with a part it excludes, and the trial feedback said only how many rows were
// stored. The model had seen no row through that filter before it submitted.
// A judged trial now names, per processing condition of each record set, the
// rows that condition alone left out -- the judge's summary already holds them,
// screened (`../../result-verification/processing-account.ts`) -- with the
// condition's wording and counts, and one sentence saying how to read them.
// Core's `testedLabel` bookkeeping is never said.
//
// Unlike a read's rows (`./reads.ts`), which stay counts here, these are named:
// a read's left-out rows are on the page the model explored, while rows the
// saved answer drops after the run are seen nowhere else.

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioResultConditionName, type AutomationStudioRunResultSummary } from "../../result-verification/index.ts";

/** What the rows mean and what to do about them, said once (header). No site's words. */
const PROCESSED_OUT = "Each list below is the rows a read kept and the saved answer then left out by one condition of recordOutput.process.where alone: every other condition kept them, so the run did not store them. "
  + "Read each row against the request's own words. A row that is the kind of thing the request asks for must not be left out, even when its text also mentions something the request excludes: a report filed with or including an excluded appendix is still the report. "
  + "Where a listed row is one the request asks for, change that condition so it keeps it.";

/** Each processing condition's rows and Core's sentence for them; nothing when no condition alone left a row out. */
export function automationStudioTrialProcessedOutFeedback(summary: AutomationStudioRunResultSummary): { conditions: JsonObject[]; said: string } | undefined {
  const conditions = summary.recordSets.flatMap((set) => (set.processing?.conditions ?? []).flatMap((entry, index): JsonObject[] => entry.leftOutOnlyByThis?.length
    ? [{ dataset: set.datasetId, condition: automationStudioResultConditionName(entry.number ?? index + 1, entry.condition), rejected: entry.rejected, rejectedByItself: entry.alone, rows: [...entry.leftOutOnlyByThis] }]
    : []));
  return conditions.length ? { conditions, said: PROCESSED_OUT } : undefined;
}
