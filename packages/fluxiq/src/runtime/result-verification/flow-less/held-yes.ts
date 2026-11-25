// A yes Core held, in Core's words (t1032): why, and where it held it for evidence it could not read, which calls'
// evidence that was (`evidenceProjection.missing`). Run-mwv5m906-5e999159's 0.8 yes with no defects (0094) reached the
// model only as "The check could not tell whether this is what was asked for.", and it went looking for a pager.
// The calls are named by their ids and Core's codes, each screened as a judge's own words are.
import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioFlowLessScreenedWords } from "./screened-words.ts";

/** Stands in for a call id the screen dropped whole. */
const WITHHELD = "(withheld)";

export function automationStudioFlowLessHeldYesReason(reason: string, read: Pick<AutomationStudioRunResultSummary, "evidenceProjection">): string {
  const gaps = (read.evidenceProjection?.missing ?? []).map((gap) => automationStudioFlowLessScreenedWords(`${gap.source} (${gap.codes.join(", ")})`).text ?? WITHHELD);
  return `The check said yes, but Core held it unconfirmed: ${reason}${gaps.length ? ` The evidence Core could not read: ${gaps.join("; ")}.` : ""}`;
}
