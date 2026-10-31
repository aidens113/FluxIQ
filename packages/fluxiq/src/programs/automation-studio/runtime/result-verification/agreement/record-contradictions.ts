import type { AutomationStudioResultReadAccount, AutomationStudioResultRecordSetSummary } from "../contracts/index.ts";
import { automationStudioResultReadStop } from "../read-account/index.ts";
import { automationStudioResultOrderClaimContradicted } from "../value-readings/index.ts";
import { automationStudioReferenceNow } from "../../reference-now/index.ts";
import type { JudgeReading } from "./types.ts";

/**
 * A reading's words that say a list has pages its read did not reach: more,
 * further, remaining or unread pages (never "no more" or "no further"), "not
 * every page", a read that stopped early, or a page bound to raise. Generic
 * words about paging only, never about any site or task.
 */
export const MORE_PAGES = /(?<!\bno\s)(?<!\bno\s\w+\s)\b(?:more|further|remaining|additional|unread|later|subsequent)\s+pages?\b|\bnot\s+(?:every|all(?:\s+the)?)\s+pages?\b|\bstopped\s+(?:early|too\s+soon|before\s+the\s+(?:last|end))\b|\b(?:did\s+not|didn't)\s+(?:read|follow|reach)\s+(?:every|all|the\s+(?:last|remaining))\b|\b(?:increase|raise)\s+(?:the\s+)?(?:page\s+)?(?:limit|bound)\b/iu;

/**
 * Whether a reading says there are pages left unread where Core's own record
 * says otherwise: at least one read follows pages, and every one that does
 * says its list ended, with a stop word of the list's own and nothing cut
 * short (`../read-account/stop.ts`). Without reads, or with any paging read the
 * record leaves open, nothing is contradicted.
 */
export function contradictsPagingRecord(reading: JudgeReading, reads: readonly AutomationStudioResultReadAccount[] | undefined): boolean {
  const paging = pagingReads(reads);
  if (!paging.length) return false;
  const listEnded = paging.every((read) => read.stop !== undefined && !read.truncated && automationStudioResultReadStop(read) === "list_ended");
  if (!listEnded) return false;
  return [reading.expected, reading.observed, reading.advice].some((text) => typeof text === "string" && MORE_PAGES.test(text));
}

/** Whether a reading denies an order every record set's own sort reading says the rows have (`../value-readings/order-claim.ts`, t511). */
export function contradictsOrderRecord(reading: JudgeReading, recordSets: readonly AutomationStudioResultRecordSetSummary[] | undefined, now?: number): boolean {
  const referenceNow = automationStudioReferenceNow(now) ?? Date.now();
  return [reading.expected, reading.observed, reading.advice].some((text) => automationStudioResultOrderClaimContradicted(text, recordSets, referenceNow));
}

/** The reads that follow pages: authored to, or read more than one page or loop pass. */
export function pagingReads(reads: readonly AutomationStudioResultReadAccount[] | undefined): AutomationStudioResultReadAccount[] {
  return (reads ?? []).filter((read) => read.paginates === true || read.pagesRead > 1 || (read.keptPerPage?.length ?? 0) > 1);
}
