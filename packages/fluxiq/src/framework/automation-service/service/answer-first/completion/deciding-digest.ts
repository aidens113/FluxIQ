// What decides a completion's verdict, as one digest (plan D14, audit change 7): the inputs a judge's
// answer rests on, and nothing it merely would be shown beside them. A completion whose digest is one
// the check already refused is answered from that refusal, with no judge call (`./check.ts`).
//
// **Why the summary's own digest was not enough (t1036).** `automationStudioFlowLessSummaryDigest`
// hashes the summary as the attempt holds it, and that holds the page as the domain returned it: the
// end view and both witnesses carry the whole page reading, handles and all, which the judge is never
// shown (the domain's projector turns it into its semantic state, `captureOmitted`). Each completion
// reads the page afresh, so two completions over one unchanged site differed by a handle or a scroll
// line, and were judged again for the same no: run-mwuxd2v9-33928ea3 (0163, 0182) and
// run-mwv5m906-5e999159 (0081), whose judge-visible summaries were identical to the one just refused.
// So where the check is given the judge's own projection (`shown`), the digest is of what the judge is
// shown, which holds exactly the rows (declared columns, in order), the lasting acts, the result's
// declared output and its processing (`resultEvidence`), where each read read and what it left out,
// the looks after an act, the model's own answer words, and the site's end state as the projector
// states it. The trail is out of it as it always was (`../../../../../runtime/result-verification/flow-less/summary-digest.ts`):
// what in it bears on the result reaches the digest through the result itself.
//
// The draft the attempt holds is the last input (`draft`): an amendment is something done since the verdict.
// A check given no projection hashes the summary as before.

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioFlowLessJsonDigest, automationStudioFlowLessSummaryDigest, type AutomationStudioFlowLessSummary } from "../../../../../runtime/result-verification/index.ts";

/** The judge's own view of a summary: what it is sent, as `automationStudioFlowLessJudgedSummary` makes it. */
export type AutomationStudioAnswerFirstShownSummary = (summary: AutomationStudioFlowLessSummary) => JsonObject;

/** The members of what the judge is shown that only frame it: the question, the trail and the repeat note (header). */
const FRAME = ["question", "trail", "askedAgain"] as const;

export function automationStudioAnswerFirstDecidingDigest(input: { summary: AutomationStudioFlowLessSummary; shown?: AutomationStudioAnswerFirstShownSummary | undefined; draft?: unknown }): string {
  const evidence = input.shown ? deciding(input.shown(input.summary)) : automationStudioFlowLessSummaryDigest(input.summary);
  return automationStudioFlowLessJsonDigest({ evidence, draft: input.draft ?? null });
}

function deciding(shown: JsonObject): JsonObject {
  const kept: JsonObject = { ...shown };
  for (const key of FRAME) delete kept[key];
  return kept;
}
