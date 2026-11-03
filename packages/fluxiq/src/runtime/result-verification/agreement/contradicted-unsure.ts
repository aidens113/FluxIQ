import type { AutomationStudioResultVerification } from "../contracts/index.ts";
import { automationStudioResultReadPagesClause } from "../read-account/index.ts";
import { automationStudioResultDedupeDoubtContradicted } from "../refuted-no/index.ts";
import { automationStudioResultNarrowingDoubtContradicted } from "../unsure-doubts/index.ts";
import { noRecordOf } from "./no-record.ts";
import { contradictsPagingRecord, pagingReads } from "./record-contradictions.ts";
import type { AutomationStudioResultVerificationAgreementInput } from "./types.ts";

/**
 * `{ contradictedUnsure }` when `verification` is an unsure a model gave whose
 * doubt speaks of pages left unread where every paging read's record says its
 * list ended (`contradictsPagingRecord`), of rows the dedupe merged where
 * Core's record says it removed none (`../refuted-no/dedupe-doubt.ts`, t628),
 * or of a step choosing an option the request does not name where the option
 * is the request's own words (t655), naming the record; nothing otherwise.
 */
export function contradictedUnsure(call: 1 | 2, verification: AutomationStudioResultVerification, input: AutomationStudioResultVerificationAgreementInput): { contradictedUnsure?: NonNullable<AutomationStudioResultVerification["contradictedUnsure"]> } {
  const doubt = verification.verdict === "unsure" && verification.basis === "model" ? verification.unsureReading : undefined;
  if (!doubt) return {};
  if (contradictsPagingRecord(doubt, input.reads)) {
    const record = pagingReads(input.reads).map((read) => `Read ${read.nodeId} read ${automationStudioResultReadPagesClause(read)}.`).join(" ");
    return { contradictedUnsure: { call, record } };
  }
  const record = noRecordOf(input);
  const dedupe = record ? automationStudioResultDedupeDoubtContradicted(doubt, record) : undefined;
  if (dedupe) return { contradictedUnsure: { call, record: dedupe, about: "dedupe" } };
  // A step said to choose an option the request does not name, whose option is the request's own words (t655, `../unsure-doubts/`).
  const narrowing = automationStudioResultNarrowingDoubtContradicted(doubt, input.reads, input.requestText, input.wording?.says);
  return narrowing ? { contradictedUnsure: { call, record: narrowing, about: "narrowing" } } : {};
}
