// A trial's change in the summary its judge reads (t775, `../../../summary.ts`):
// after what the trial started with and before earlier advice, which stays
// last so the judge's cached prefix is unchanged (t752); Core's findings over
// it beside it; every text screened. A library's holds, no realistic site.
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultEarlierAdvice } from "../../../../../result-verification/index.ts";
import { libraryHoldsChange } from "../../../../../result-verification/site-change/tests/library-holds-fixture.ts";
import { automationStudioCandidateTrialSummary } from "../../../index.ts";

const EARLIER: AutomationStudioResultEarlierAdvice[] = [{
  revision: 1, verdict: "no", advice: "Place the hold from the book's own page.", followed: "changed", named: ["step n3"],
  said: "After the trial of revision 1 (judged no) the judge advised: Place the hold from the book's own page. Revision 2 changed step n3, which that advice named."
}];
const STARTED = ["already done by this build (act-1): press Place hold"];

describe("a trial's siteChange in its judge's summary (t775)", () => {
  it("sits after startedWith and before earlierAdvice, with Core's findings beside it", async () => {
    const summary = await automationStudioCandidateTrialSummary({
      recordSets: [], graph: undefined, trace: undefined, deniedEvidenceKeys: [], startedWith: STARTED,
      siteChange: libraryHoldsChange(), siteChangeFindings: [{ code: "result.unasked_change", witness: "w9", where: "Saved searches" }], earlierAdvice: EARLIER
    });
    expect(Object.keys(summary).slice(-4)).toEqual(["startedWith", "siteChange", "siteChangeFindings", "earlierAdvice"]);
    expect(summary.siteChange).toEqual(libraryHoldsChange());
    expect(summary.siteChangeFindings).toEqual([{ code: "result.unasked_change", witness: "w9", where: "Saved searches" }]);
    expect(summary.withheld).toBe(false);
  });

  it("is last but for earlierAdvice without startedWith, and absent without a packet", async () => {
    const summary = await automationStudioCandidateTrialSummary({ recordSets: [], graph: undefined, trace: undefined, siteChange: libraryHoldsChange(), earlierAdvice: EARLIER });
    expect(Object.keys(summary).slice(-2)).toEqual(["siteChange", "earlierAdvice"]);
    expect(summary).not.toHaveProperty("siteChangeFindings");
    const none = await automationStudioCandidateTrialSummary({ recordSets: [], graph: undefined, trace: undefined, startedWith: STARTED, earlierAdvice: EARLIER });
    expect(none).not.toHaveProperty("siteChange");
    expect(Object.keys(none).slice(-2)).toEqual(["startedWith", "earlierAdvice"]);
  });

  it("says a credential-shaped line as withheld, keeps every proof, and marks the summary withheld", async () => {
    const change = libraryHoldsChange();
    const witness = change.witnesses[0]!;
    const carded = { ...change, witnesses: [{ ...witness, change: { added: 1, removed: 0, changed: 0, unchanged: 3, lines: { gone: [], added: ["Card 4111 1111 1111 1111 on file"] } } }, change.witnesses[1]!] };
    const summary = await automationStudioCandidateTrialSummary({ recordSets: [], graph: undefined, trace: undefined, deniedEvidenceKeys: [], siteChange: carded });
    expect(JSON.stringify(summary.siteChange)).not.toContain("4111");
    expect(summary.siteChange?.witnesses[0]?.change).toMatchObject({ lines: { added: ["(withheld)"] } });
    expect(summary.siteChange?.proofs).toEqual(change.proofs);
    expect(summary.withheld).toBe(true);
  });
});
