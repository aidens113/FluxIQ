import type { AutomationStudioResultReadAccount, AutomationStudioResultRecordSetSummary, AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultReadPagesClause } from "../read-account/index.ts";
import { automationStudioResultNoRecord, type AutomationStudioResultNoClaim, type AutomationStudioResultNoRecord } from "../refuted-no/index.ts";
import { contradictsOrderRecord, contradictsPagingRecord, MORE_PAGES, pagingReads } from "./record-contradictions.ts";
import type { AutomationStudioResultVerificationAgreementInput } from "./types.ts";

/** Core's record of the judged result, built once per summary: what a no's reasons are weighed against (t607). */
const NO_RECORDS = new WeakMap<AutomationStudioRunResultSummary, { input: AutomationStudioResultVerificationAgreementInput; record: AutomationStudioResultNoRecord }>();

/** The record a no is weighed against, with the page and order claims this directory checks itself; none without the summary. */
export function noRecordOf(input: AutomationStudioResultVerificationAgreementInput): AutomationStudioResultNoRecord | undefined {
  const summary = input.summary;
  if (!summary) return undefined;
  const known = NO_RECORDS.get(summary);
  // The same record only for the same request, reads and record sets: a re-agreement after a re-ask passes them all on unchanged.
  if (known && known.input.requestText === input.requestText && known.input.wording === input.wording && known.input.reads === input.reads && known.input.recordSets === input.recordSets) return known.record;
  const reads = input.reads ?? summary.reads;
  const recordSets = input.recordSets ?? summary.recordSets;
  const record = automationStudioResultNoRecord({ summary, requestText: input.requestText, wording: input.wording, other: (sentence) => pageOrOrderClaim(sentence, reads, recordSets) });
  NO_RECORDS.set(summary, { input, record });
  return record;
}

/** Words that deny an order, for a claim the record does not contradict: such a claim still stands. */
const DENIES_ORDER = /\b(?:out\s+of\s+order|unsorted|wrong(?:ly)?\s+(?:sorted|ordered|order)|not\s+(?:sorted|ordered|in\s+(?:\w+\s+){0,2}order)|(?:sort|order)\s+(?:is|was)\s+(?:wrong|incorrect|reversed))\b/iu;

/** A sentence's claim about pages (t501) or order (t511), refuted where the record contradicts it, standing where it does not; nothing where it makes none. */
function pageOrOrderClaim(sentence: string, reads: readonly AutomationStudioResultReadAccount[] | undefined, recordSets: readonly AutomationStudioResultRecordSetSummary[] | undefined): AutomationStudioResultNoClaim | undefined {
  const reading = { observed: sentence };
  if (MORE_PAGES.test(sentence)) {
    return contradictsPagingRecord(reading, reads)
      ? { refuted: true, finding: pagingReads(reads).map((read) => `Read ${read.nodeId} read ${automationStudioResultReadPagesClause(read)}.`).join(" ") }
      : { refuted: false };
  }
  if (contradictsOrderRecord(reading, recordSets)) return { refuted: true, finding: "Core sorted the answer itself, and its sortRead says the rows are in that order." };
  return DENIES_ORDER.test(sentence) ? { refuted: false } : undefined;
}
