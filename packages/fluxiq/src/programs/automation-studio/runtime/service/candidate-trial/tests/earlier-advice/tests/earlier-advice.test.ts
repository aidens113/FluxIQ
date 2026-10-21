// The judge of a build's trial is told each earlier judged trial's advice
// (t752): the gate's `earlierAdvice` rides the trial request to the summary the
// judge reads, appended last where the summary is made, so the cached prefix
// before it is unchanged (`../../../summary.ts`, `../../../run.ts`). Generic words: a
// library's catalogue search, no realistic site, task or answer.
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultEarlierAdvice } from "../../../../../result-verification/index.ts";
import { automationStudioCandidateTrialSummary, runAutomationStudioCandidateTrial } from "../../../index.ts";
import { trialFixture } from "../../fixtures.ts";

const EARLIER: AutomationStudioResultEarlierAdvice[] = [{
  revision: 1, verdict: "no", advice: "Also accept books on hold.", followed: "changed", named: ["condition 1 (status contains [\"On shelf\"]) of step find_books.s3"],
  said: "After the trial of revision 1 (judged no) the judge advised: Also accept books on hold. Revision 2 changed condition 1 (status contains [\"On shelf\"]) of step find_books.s3, which that advice named."
}];

describe("earlier judged trials' advice in a trial's summary (t752)", () => {
  it("is the summary's last key, after what the trial started with, and absent when there is none", async () => {
    const summary = await automationStudioCandidateTrialSummary({ recordSets: [], graph: undefined, trace: undefined, startedWith: ["already done by this build (act-1): press button"], earlierAdvice: EARLIER });
    expect(Object.keys(summary).at(-1)).toBe("earlierAdvice");
    expect(Object.keys(summary).at(-2)).toBe("startedWith");
    expect(summary.earlierAdvice).toEqual(EARLIER);
    expect(await automationStudioCandidateTrialSummary({ recordSets: [], graph: undefined, trace: undefined, earlierAdvice: [] })).not.toHaveProperty("earlierAdvice");
  });

  it("rides a candidate trial's request to the summary its judge reads", async () => {
    const fixture = trialFixture();
    fixture.ports.graphOptions = ({ signal }) => ({ signal, now: () => 100, nativeNodeExecutor: async () => ({ result: { status: "success", route: "success", outputs: {} } }) } as ReturnType<typeof fixture.ports.graphOptions>);
    fixture.ports.deniedEvidenceKeys = [];
    await runAutomationStudioCandidateTrial({ ...fixture.request(), earlierAdvice: EARLIER }, fixture.ports);
    expect(fixture.judged[0]!.summary.earlierAdvice).toEqual(EARLIER);
    expect(Object.keys(fixture.judged[0]!.summary).at(-1)).toBe("earlierAdvice");
  });
});
