// A yes whose own words say it could not judge (t875, lane C `run-mw4bxkn9-004e2667`):
// a judge said yes over a read that stored no rows while its summary said what was
// asked "cannot be judged". Such a yes is no yes (`./records-yes.ts`). Only the
// judge's own reading is read (observed, changed, its summary), never what it says
// the request expected, and only for what judging can fail at: being judged,
// verified, confirmed, determined, assessed, settled or told. "Cannot be seen", which
// an honest yes on a removal says, is not one of them.

const CANNOT = String.raw`(?:cannot|can\s+not|can't|can’t|could\s+not|couldn't|couldn’t|unable\s+to|impossible\s+to|not\s+possible\s+to|no\s+way\s+to)`;
const JUDGE = String.raw`(?:judged?|verif(?:y|ied)|confirm(?:ed)?|determined?|assess(?:ed)?|settled?|tell|told)`;
const UNJUDGED = new RegExp(String.raw`\b${CANNOT}\s+(?:be\s+)?${JUDGE}\b`, "iu");

/** Whether the yes's own reading says what was asked could not be judged from what it was shown. */
export function automationStudioResultYesSaysUnjudged(said: { observed?: string | undefined; changed?: string | undefined; summaryText?: string | undefined }): boolean {
  return [said.observed, said.changed, said.summaryText].some((text) => typeof text === "string" && UNJUDGED.test(text));
}
